import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { checkinSchema } from "@/lib/validation";
import { extractQrToken } from "@/lib/registration";
import { fail, guard, zodFail } from "@/lib/http";
import { audit } from "@/lib/audit";
import { getSettings } from "@/lib/settings";
import type { CheckpointName, TeamStatus } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

/** Extract all plausible lookup keys from any scanned QR text, URL, token, or code. */
export function extractLookupCandidates(payload: string): string[] {
  const trimmed = payload.trim();
  if (!trimmed) return [];
  const set = new Set<string>();
  set.add(trimmed);

  // If URL, parse out query parameters and pathname segments
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    try {
      const url = new URL(trimmed);
      for (const val of url.searchParams.values()) {
        if (val) set.add(val.trim());
      }
      const parts = url.pathname.split("/").filter(Boolean);
      for (const p of parts) {
        const decoded = decodeURIComponent(p).trim();
        if (
          decoded &&
          !["api", "tickets", "ticket", "pdf", "checkin", "admin"].includes(decoded.toLowerCase())
        ) {
          set.add(decoded);
        }
      }
    } catch {}
  }

  // Handle TECHSIEGE prefixes
  for (const item of Array.from(set)) {
    if (item.toUpperCase().startsWith("TECHSIEGE:TICKET:")) {
      set.add(item.replace(/^TECHSIEGE:TICKET:/i, "").trim());
    } else {
      set.add(`TECHSIEGE:TICKET:${item}`);
    }
  }

  return Array.from(set).filter(Boolean);
}

/** Volunteer-facing scan endpoint. Idempotent per team+checkpoint. */
export async function POST(req: Request) {
  const auth = await guard("checkin", "write");
  if ("response" in auth) return auth.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail(400, "Invalid request.");
  }

  const parsed = checkinSchema.safeParse(raw);
  if (!parsed.success) return zodFail(parsed.error as ZodError);
  const { payload, teamId, checkpoint = "REGISTRATION", note, notedBy } = parsed.data;

  // Enforce rule: QR code scanning is ONLY for registration / admission check-in.
  // Round 1, Round 2, Midnight, and Submission do NOT use QR scanning.
  if (payload && checkpoint && checkpoint !== "REGISTRATION") {
    return fail(
      400,
      "QR code scanning is not supported for Round 1, Round 2, Midnight, or Submission. Log these checkpoints directly on the checkpoint board.",
    );
  }

  const effectiveCheckpoint: CheckpointName = payload ? "REGISTRATION" : (checkpoint as CheckpointName);

  const candidates = payload ? extractLookupCandidates(payload) : [];

  const team = await prisma.team.findFirst({
    where: payload
      ? {
          OR: [
            ...candidates.map((c) => ({ code: { equals: c, mode: "insensitive" as const } })),
            ...candidates.map((c) => ({ qrToken: { equals: c, mode: "insensitive" as const } })),
            ...candidates.map((c) => ({ id: c })),
            ...candidates.map((c) => ({ sourceRef: c })),
            ...candidates.map((c) => ({ contactEmail: { equals: c, mode: "insensitive" as const } })),
            ...candidates.map((c) => ({ name: { equals: c, mode: "insensitive" as const } })),
            {
              participants: {
                some: {
                  OR: [
                    ...candidates.map((c) => ({ ticketId: { equals: c, mode: "insensitive" as const } })),
                    ...candidates.map((c) => ({ qrToken: { equals: c, mode: "insensitive" as const } })),
                    ...candidates.map((c) => ({ email: { equals: c, mode: "insensitive" as const } })),
                  ],
                },
              },
            },
          ],
        }
      : { id: teamId },
    include: {
      track: { select: { name: true } },
      participants: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          ticketId: true,
          pdfFilename: true,
          qrToken: true,
          checkedIn: true,
          checkedInAt: true,
          checkedInBy: true,
        },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      },
      _count: { select: { participants: true } },
    },
  });

  if (!team) {
    return NextResponse.json(
      { ok: false, error: "No matching team or ticket found. Check the code and try again.", reason: "UNKNOWN" },
      { status: 404 },
    );
  }

  if (team.status === "DISQUALIFIED") {
    return NextResponse.json(
      { ok: false, error: `${team.code} is disqualified — see an organiser.`, reason: "DISQUALIFIED", team },
      { status: 409 },
    );
  }

  // Admission check-in moves team into CHECKED_IN
  const nextStatus: TeamStatus | undefined =
    effectiveCheckpoint === "REGISTRATION" && (team.status === "CONFIRMED" || team.status === "PENDING")
      ? "CHECKED_IN"
      : undefined;

  const already = await prisma.checkpointLog.findFirst({
    where: { teamId: team.id, checkpoint: effectiveCheckpoint },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, note: true, notedBy: true },
  });

  const recorder = notedBy?.trim() || auth.actor.name;

  const matchedParticipant = payload
    ? team.participants.find((p) =>
        candidates.some(
          (c) =>
            p.ticketId?.toLowerCase() === c.toLowerCase() ||
            p.qrToken?.toLowerCase() === c.toLowerCase() ||
            p.email.toLowerCase() === c.toLowerCase(),
        ),
      )
    : undefined;

  // Individual attendee check-in at REGISTRATION
  if (effectiveCheckpoint === "REGISTRATION" && matchedParticipant) {
    if (matchedParticipant.checkedIn) {
      return NextResponse.json({
        ok: true,
        duplicate: true,
        team: {
          id: team.id,
          code: team.code,
          name: team.name,
          status: team.status,
          paymentStatus: team.paymentStatus,
          college: team.college,
          track: team.track,
          participants: team.participants,
          _count: team._count,
        },
        matchedParticipant,
        checkpoint,
        message: `${matchedParticipant.name} (${matchedParticipant.ticketId ?? "Member"}) was already checked in${matchedParticipant.checkedInAt ? ` at ${new Date(matchedParticipant.checkedInAt).toLocaleTimeString()}` : ""}.`,
        loggedAt: matchedParticipant.checkedInAt ?? already?.createdAt ?? new Date(),
      });
    }

    // Mark this specific participant as checked in
    const updatedParticipant = await prisma.participant.update({
      where: { id: matchedParticipant.id },
      data: {
        checkedIn: true,
        checkedInAt: new Date(),
        checkedInBy: recorder,
      },
    });

    const checkedInCount =
      team.participants.filter((p) => p.id === matchedParticipant.id || p.checkedIn).length;
    const totalCount = team.participants.length;

    if (!already) {
      await prisma.checkpointLog.create({
        data: {
          teamId: team.id,
          checkpoint: "REGISTRATION",
          note: note || `Attendee ${matchedParticipant.name} (${matchedParticipant.ticketId ?? ""}) checked in`,
          notedBy: recorder,
          scannedById: auth.actor.id,
        },
      });
    }

    if (nextStatus) {
      await prisma.team.update({
        where: { id: team.id },
        data: { status: nextStatus },
      });
    }

    await audit({
      actorId: auth.actor.id,
      actorEmail: auth.actor.email,
      action: "participant.checkin",
      entityType: "participant",
      entityId: matchedParticipant.id,
      after: {
        name: matchedParticipant.name,
        ticketId: matchedParticipant.ticketId,
        teamCode: team.code,
      },
    });

    return NextResponse.json({
      ok: true,
      duplicate: false,
      team: {
        id: team.id,
        code: team.code,
        name: team.name,
        status: nextStatus ?? team.status,
        paymentStatus: team.paymentStatus,
        college: team.college,
        track: team.track,
        participants: team.participants.map((p) =>
          p.id === matchedParticipant.id
            ? { ...p, checkedIn: true, checkedInAt: updatedParticipant.checkedInAt, checkedInBy: recorder }
            : p,
        ),
        _count: team._count,
      },
      matchedParticipant: {
        ...matchedParticipant,
        checkedIn: true,
        checkedInAt: updatedParticipant.checkedInAt,
        checkedInBy: recorder,
      },
      checkpoint: effectiveCheckpoint,
      message: `${matchedParticipant.name} checked in successfully! (${checkedInCount} of ${totalCount} members checked in).`,
      loggedAt: updatedParticipant.checkedInAt,
    });
  }

  if (already && !teamId) {
    // Re-scanning the same code must stay idempotent
    return NextResponse.json({
      ok: true,
      duplicate: true,
      team: {
        id: team.id,
        code: team.code,
        name: team.name,
        status: team.status,
        paymentStatus: team.paymentStatus,
        college: team.college,
        track: team.track,
        participants: team.participants,
        _count: team._count,
      },
      matchedParticipant,
      checkpoint: effectiveCheckpoint,
      message:
        effectiveCheckpoint === "REGISTRATION"
          ? `Team ${team.name} (${team.code}) was already checked in${already.createdAt ? ` at ${new Date(already.createdAt).toLocaleTimeString()}` : ""}.`
          : `${team.code} already logged for ${effectiveCheckpoint}.`,
      loggedAt: already.createdAt,
    });
  }

  // When team pass is checked in at REGISTRATION, mark all participants as checked in
  if (effectiveCheckpoint === "REGISTRATION") {
    await prisma.participant.updateMany({
      where: { teamId: team.id, checkedIn: false },
      data: {
        checkedIn: true,
        checkedInAt: new Date(),
        checkedInBy: recorder,
      },
    });
  }

  const updatedParticipants = await prisma.participant.findMany({
    where: { teamId: team.id },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });

  const [log] = await prisma.$transaction([
    already
      ? prisma.checkpointLog.update({
          where: { id: already.id },
          data: { note, notedBy: recorder, scannedById: auth.actor.id },
          select: { id: true, createdAt: true },
        })
      : prisma.checkpointLog.create({
          data: {
            teamId: team.id,
            checkpoint: effectiveCheckpoint,
            note: note || (effectiveCheckpoint === "REGISTRATION" ? `Team ${team.name} (${team.code}) checked in` : `${effectiveCheckpoint} logged`),
            notedBy: recorder,
            scannedById: auth.actor.id,
          },
          select: { id: true, createdAt: true },
        }),
    ...(nextStatus
      ? [
          prisma.team.update({
            where: { id: team.id },
            data: { status: nextStatus },
            select: { id: true },
          }),
        ]
      : []),
  ]);

  if (already && teamId) {
    await audit({
      actorId: auth.actor.id,
      actorEmail: auth.actor.email,
      action: "checkpoint.update",
      entityType: "checkpointLog",
      entityId: already.id,
      before: { note: already.note, notedBy: already.notedBy },
      after: { note, notedBy: recorder },
    });
  }

  if (nextStatus) {
    await audit({
      actorId: auth.actor.id,
      actorEmail: auth.actor.email,
      action: "team.status.update",
      entityType: "team",
      entityId: team.id,
      before: { status: team.status },
      after: { status: nextStatus },
    });
  }

  return NextResponse.json({
    ok: true,
    duplicate: false,
    team: {
      id: team.id,
      code: team.code,
      name: team.name,
      status: nextStatus ?? team.status,
      paymentStatus: team.paymentStatus,
      college: team.college,
      track: team.track,
      participants: updatedParticipants,
      _count: team._count,
    },
    matchedParticipant,
    checkpoint: effectiveCheckpoint,
    message:
      effectiveCheckpoint === "REGISTRATION"
        ? `Team ${team.name} (${team.code}) checked in successfully! All members admitted.`
        : `${team.code} logged for ${effectiveCheckpoint}.`,
    loggedAt: log!.createdAt,
  });
}
