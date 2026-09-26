import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, guard } from "@/lib/http";
import { toCsv } from "@/lib/utils";
import { teamStatusUpdateSchema, screeningSchema } from "@/lib/validation";
import { audit, diff } from "@/lib/audit";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

type Filters = {
  trackId?: string;
  status?: string;
  college?: string;
  city?: string;
  q?: string;
  page?: number;
  perPage?: number;
};

function buildWhere(f: Filters): Prisma.TeamWhereInput {
  const where: Prisma.TeamWhereInput = {};
  if (f.trackId) where.trackId = f.trackId;
  if (f.status) where.status = f.status as Prisma.EnumTeamStatusFilter["equals"];
  if (f.college) where.college = { contains: f.college, mode: "insensitive" };
  if (f.city) where.city = { contains: f.city, mode: "insensitive" };
  if (f.q) {
    where.OR = [
      { name: { contains: f.q, mode: "insensitive" } },
      { code: { contains: f.q, mode: "insensitive" } },
      { contactName: { contains: f.q, mode: "insensitive" } },
      { contactEmail: { contains: f.q, mode: "insensitive" } },
    ];
  }
  return where;
}

const LIST_SELECT = {
  id: true,
  code: true,
  name: true,
  status: true,
  college: true,
  city: true,
  contactName: true,
  contactEmail: true,
  createdAt: true,
  track: { select: { id: true, name: true } },
  // `scores` is selected so the delete affordance can tell up front that a team
  // is undeletable, matching what the DELETE route refuses on.
  _count: { select: { participants: true, checkpoints: true, scores: true } },
  submission: { select: { id: true, screeningStatus: true } },
} satisfies Prisma.TeamSelect;

export async function GET(req: Request) {
  const auth = await guard("teams", "read");
  if ("response" in auth) return auth.response;

  const url = new URL(req.url);
  const filters: Filters = {
    trackId: url.searchParams.get("trackId") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    college: url.searchParams.get("college") ?? undefined,
    city: url.searchParams.get("city") ?? undefined,
    q: url.searchParams.get("q") ?? undefined,
    page: Number(url.searchParams.get("page") ?? 1),
    perPage: Math.min(200, Number(url.searchParams.get("perPage") ?? 50)),
  };
  const where = buildWhere(filters);
  const skip = ((filters.page ?? 1) - 1) * (filters.perPage ?? 50);

  /* CSV export of the whole filtered set, not just the current page. */
  if (url.searchParams.get("format") === "csv") {
    const rows = await prisma.team.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        track: { select: { name: true } },
        participants: { select: { name: true, email: true, role: true } },
        submission: { select: { githubRepoUrl: true, screeningStatus: true, submittedAt: true } },
      },
    });

    const csv = toCsv(
      [
        "team_code",
        "team_name",
        "track",
        "status",
        "college",
        "city",
        "contact_name",
        "contact_email",
        "members",
        "leader_email",
        "github_repo",
        "screening",
        "registered_at",
      ],
      rows.map((t) => [
        t.code,
        t.name,
        t.track.name,
        t.status,
        t.college,
        t.city,
        t.contactName,
        t.contactEmail,
        t.participants.length,
        t.participants.find((p) => p.role === "LEADER")?.email ?? "",
        t.submission?.githubRepoUrl ?? "",
        t.submission?.screeningStatus ?? "",
        t.createdAt.toISOString(),
      ]),
    );

    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="agentx-teams-${new Date().toISOString().slice(0, 10)}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const [rows, total, colleges] = await Promise.all([
    prisma.team.findMany({
      where,
      select: LIST_SELECT,
      orderBy: { createdAt: "desc" },
      skip,
      take: filters.perPage ?? 50,
    }),
    prisma.team.count({ where }),
    prisma.team.findMany({
      distinct: ["college"],
      select: { college: true },
      orderBy: { college: "asc" },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    teams: rows,
    total,
    page: filters.page ?? 1,
    perPage: filters.perPage ?? 50,
    colleges: colleges.map((c) => c.college),
  });
}

/** Manual status overrides. Audited. */
export async function PATCH(req: Request) {
  const auth = await guard("teams", "write");
  if ("response" in auth) return auth.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail(400, "Invalid request.");
  }

  const action = (raw as { action?: string }).action;

  if (action === "status") {
    const parsed = teamStatusUpdateSchema.safeParse(raw);
    if (!parsed.success) return fail(422, parsed.error.issues[0]?.message ?? "Invalid status.");
    const { teamId, status, reason } = parsed.data;

    const before = await prisma.team.findUnique({
      where: { id: teamId },
      select: { status: true, disqualifiedReason: true },
    });
    if (!before) return fail(404, "Team not found.");
    if (before.status === status) return NextResponse.json({ ok: true, unchanged: true });

    const team = await prisma.team.update({
      where: { id: teamId },
      data: {
        status,
        disqualifiedReason: status === "DISQUALIFIED" ? reason || "No reason given" : null,
      },
      select: { id: true, status: true },
    });

    await audit({
      actorId: auth.actor.id,
      actorEmail: auth.actor.email,
      action: "team.status.update",
      entityType: "team",
      entityId: teamId,
      before,
      after: { status, disqualifiedReason: team.status === "DISQUALIFIED" ? reason : null },
    });

    return NextResponse.json({ ok: true, team });
  }

  if (action === "track") {
    const { teamId, trackId } = raw as { teamId?: string; trackId?: string };
    if (!teamId || !trackId) return fail(422, "teamId and trackId are required.");

    const [before, track] = await Promise.all([
      prisma.team.findUnique({ where: { id: teamId }, select: { trackId: true, name: true } }),
      prisma.track.findUnique({ where: { id: trackId }, select: { id: true, name: true, active: true } }),
    ]);
    if (!before) return fail(404, "Team not found.");
    if (!track?.active) return fail(422, "That track is not available.");

    await prisma.team.update({ where: { id: teamId }, data: { trackId } });
    const d = diff({ trackId: before.trackId }, { trackId });

    await audit({
      actorId: auth.actor.id,
      actorEmail: auth.actor.email,
      action: "team.track.update",
      entityType: "team",
      entityId: teamId,
      ...d,
    });

    return NextResponse.json({ ok: true, track });
  }

  if (action === "screen") {
    const parsed = screeningSchema.safeParse(raw);
    if (!parsed.success) return fail(422, parsed.error.issues[0]?.message ?? "Invalid screening decision.");
    const { submissionId, decision, notes } = parsed.data;

    const before = await prisma.submission.findUnique({
      where: { id: submissionId },
      select: { screeningStatus: true, screeningNotes: true, team: { select: { name: true, code: true } } },
    });
    if (!before) return fail(404, "Submission not found.");

    const submission = await prisma.submission.update({
      where: { id: submissionId },
      data: {
        screeningStatus: decision,
        screeningNotes: notes,
        screenedById: auth.actor.id,
        screenedAt: new Date(),
      },
      select: { id: true, screeningStatus: true },
    });

    await audit({
      actorId: auth.actor.id,
      actorEmail: auth.actor.email,
      action: "submission.screen",
      entityType: "submission",
      entityId: submissionId,
      before: { screeningStatus: before.screeningStatus, screeningNotes: before.screeningNotes },
      after: { screeningStatus: decision, screeningNotes: notes },
    });

    return NextResponse.json({ ok: true, submission });
  }

  return fail(400, "Unknown action.");
}
