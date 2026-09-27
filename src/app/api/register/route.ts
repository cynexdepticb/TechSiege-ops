import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { createTeamAndMembers } from "@/lib/registration";
import { getSettings, registrationsRemainingSafe } from "@/lib/settings-helpers";
import { findDuplicateEmails, registrationSchema, validateLeaderRule } from "@/lib/validation";
import { sendTemplatedEmail } from "@/lib/email/send";
import { buildVars } from "@/lib/email/vars";
import { opsSlugForMarketingTrack } from "@/lib/tracks";

export const dynamic = "force-dynamic";

/** The submit payload is the same shape the form already validates against. */
type SubmitPayload = {
  action: "submit";
  team: unknown;
  members: unknown;
  resumeToken?: string;
  /**
   * The marketing site's `public.teams.id`. When present the submit is treated
   * as a re-delivery of an already-recorded registration rather than a new one,
   * so a retry after a timeout cannot create a second team or re-send every
   * confirmation email.
   */
  sourceRef?: string;
};
type CheckPayload = {
  action: "check-email" | "check-name" | "check-track";
  email?: string;
  name?: string;
  trackId?: string;
};
type Body = SubmitPayload | CheckPayload;

function error(status: number, message: string, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return error(400, "Invalid request.");
  }

  /* ── lightweight availability checks, called live from the form ── */
  if (body.action === "check-email") {
    const email = String(body.email ?? "").trim().toLowerCase();
    if (!email) return NextResponse.json({ ok: true, available: true });
    const taken = await prisma.participant.findUnique({
      where: { email },
      select: { id: true },
    });
    return NextResponse.json({ ok: true, available: !taken });
  }

  if (body.action === "check-name") {
    const name = String(body.name ?? "").trim();
    if (name.length < 3) return NextResponse.json({ ok: true, available: true });
    const taken = await prisma.team.findFirst({
      where: { name: { equals: name, mode: "insensitive" } },
      select: { id: true },
    });
    return NextResponse.json({ ok: true, available: !taken });
  }

  if (body.action === "check-track") {
    const trackId = String(body.trackId ?? "");
    if (!trackId) return NextResponse.json({ ok: true, available: true });
    const track = await prisma.track.findUnique({
      where: { id: trackId },
      select: { capacity: true, active: true, _count: { select: { teams: true } } },
    });
    if (!track?.active) {
      return NextResponse.json({ ok: true, available: false, reason: "This track is not accepting teams." });
    }
    if (track.capacity !== null && track._count.teams >= track.capacity) {
      return NextResponse.json({ ok: true, available: false, reason: "This track is full." });
    }
    return NextResponse.json({ ok: true, available: true });
  }

  /* ── final submit ── */
  if (body.action !== "submit") return error(400, "Unknown action.");

  const settings = await getSettings();
  if (!settings.registrationOpen) {
    return error(403, "Registration is closed.");
  }

  const parsed = registrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        error: "Please fix the highlighted fields.",
        fields: fieldErrors(parsed.error),
      },
      { status: 422 },
    );
  }

  const input = parsed.data;

  /* Idempotency. The marketing site commits to its own table and then forwards
     here, so a retry after a timeout is expected rather than exceptional. Without
     this a retried request would create a duplicate team and re-send every
     confirmation email to every member. */
  if (body.sourceRef) {
    const existing = await prisma.team.findUnique({
      where: { sourceRef: body.sourceRef },
      select: {
        id: true,
        code: true,
        name: true,
        track: { select: { name: true } },
      },
    });
    if (existing) {
      return NextResponse.json({
        ok: true,
        duplicate: true,
        team: existing,
        emailed: 0,
        recipients: 0,
        undelivered: [],
      });
    }
  }

  const leaderProblem = validateLeaderRule(input);
  if (leaderProblem) return error(422, leaderProblem);

  const dupes = findDuplicateEmails(input);
  if (dupes.length > 0) {
    return error(422, `Duplicate email in the form: ${dupes.join(", ")}`);
  }

  const remaining = await registrationsRemainingSafe(settings.maxTeams);
  if (remaining <= 0) return error(403, "Registration has reached the team cap.");

  /* Accepts an ops track id, an ops slug, or a marketing track id. The marketing
     form posts its own short ids, and rejecting those would push every
     registration back onto the manual import path. */
  const track = await resolveTrack(input.team.trackId);
  if ("error" in track) return error(422, track.error);

  const result = await createTeamAndMembers({
    team: {
      name: input.team.name,
      college: input.team.college,
      city: input.team.city,
      contactName: input.team.contactName,
      contactEmail: input.team.contactEmail,
      contactPhone: input.team.contactPhone,
      projectIdea: input.team.projectIdea,
      trackId: track.id,
    },
    members: input.members,
    sourceRef: body.sourceRef,
  });

  if (!result.ok) {
    if (result.code === "EMAIL_TAKEN") {
      return NextResponse.json(
        {
          ok: false,
          error:
            result.conflicts.length > 0
              ? `${result.conflicts[0]!.email} is already registered with ${result.conflicts[0]!.team ?? "another team"}. One person can only be on one team.`
              : "One of those emails is already registered on another team.",
          conflicts: result.conflicts,
        },
        { status: 409 },
      );
    }
    return error(422, "That track is not available.");
  }

  const team = await prisma.team.findUniqueOrThrow({
    where: { id: result.team.id },
    include: {
      track: { select: { name: true } },
      participants: { select: { name: true, email: true }, orderBy: { createdAt: "asc" } },
      _count: { select: { participants: true } },
    },
  });

  // Funnel: the submission itself is the completion event.
  await prisma.analyticsEvent.create({
    data: { type: "FORM_COMPLETE", path: "/register", teamId: team.id },
  });

  /* Confirmation email to *every* member, not just the team contact. Each
     student registered, so each student gets acknowledged, and each sees their
     own name in the greeting.

     This is best-effort — a provider outage must not roll back a registration
     that is already committed. But "best-effort" must not quietly become
     "report success anyway": `sendTemplatedEmail` records a rejection and
     *returns* FAILED rather than throwing, so the status has to be read
     explicitly. Ignoring it is how a 403 from the mail provider ended up
     reported to the student as "your email is on its way". */
  const recipients =
    team.participants.length > 0
      ? team.participants
      : [{ name: team.contactName, email: team.contactEmail }];

  let emailedCount = 0;
  const undelivered: string[] = [];
  for (const person of recipients) {
    const firstName = person.name.trim().split(/\s+/)[0] || "there";
    try {
      const vars = await buildVars(team, { leaderName: firstName });
      const sent = await sendTemplatedEmail({
        templateKey: "registration_confirmation",
        type: "CONFIRMATION",
        teamId: team.id,
        to: person.email,
        recipientName: person.name,
        vars,
      });
      if (sent.status === "SENT") emailedCount++;
      else undelivered.push(person.email);
    } catch (e) {
      undelivered.push(person.email);
      console.error(`[register] confirmation email to ${person.email} failed`, e);
    }
  }

  if (undelivered.length > 0) {
    console.warn(
      `[register] ${team.code}: ${undelivered.length}/${recipients.length} confirmation email(s) not delivered: ${undelivered.join(", ")}`,
    );
  }

  return NextResponse.json({
    ok: true,
    team: { id: team.id, code: team.code, name: team.name, track: team.track.name },
    emailed: emailedCount,
    recipients: recipients.length,
    undelivered,
  });
}

function fieldErrors(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join(".") || "form";
    if (!out[path]) out[path] = issue.message;
  }
  return out;
}

/**
 * Resolves whatever the caller called a track into an ops Track row.
 *
 * Three accepted shapes, tried in order: an ops cuid (the public registration
 * form posts these), an ops slug, then a marketing track id via TRACK_MAP. The
 * last one is what lets the marketing site forward registrations directly.
 *
 * An unmapped or unknown value is a 422 naming the track, not a fallback to some
 * default track — silently putting a team in the wrong track would corrupt the
 * judging split, and the error is what tells whoever has to fix TRACK_MAP.
 */
async function resolveTrack(
  value: string,
): Promise<{ id: string; name: string } | { error: string }> {
  const byId = await prisma.track.findUnique({
    where: { id: value },
    select: { id: true, name: true },
  });
  if (byId) return byId;

  const bySlug = await prisma.track.findUnique({
    where: { slug: value },
    select: { id: true, name: true },
  });
  if (bySlug) return bySlug;

  const slug = opsSlugForMarketingTrack(value);
  if (!slug) {
    return {
      error: `Unknown track "${value}". Send an ops track id, an ops track slug, or a marketing track id listed in TRACK_MAP.`,
    };
  }

  const mapped = await prisma.track.findUnique({
    where: { slug },
    select: { id: true, name: true },
  });
  if (!mapped) {
    return {
      error: `Track "${value}" maps to ops track "${slug}", which does not exist. Run "npm run db:seed" or correct TRACK_MAP in src/lib/tracks.ts.`,
    };
  }
  return mapped;
}
