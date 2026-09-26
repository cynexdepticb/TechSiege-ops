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
  const { payload, teamId, checkpoint, note, notedBy } = parsed.data;

  // A scan carries the secret QR token; manual entry from the checkpoint board
  // carries the team id, since there is no code to scan at that desk.
  const team = await prisma.team.findUnique({
    where: payload ? { qrToken: extractQrToken(payload) } : { id: teamId },
    select: {
      id: true,
      code: true,
      name: true,
      status: true,
      track: { select: { name: true } },
      _count: { select: { participants: true } },
    },
  });

  if (!team) {
    return NextResponse.json(
      { ok: false, error: "No team matches that code.", reason: "UNKNOWN" },
      { status: 404 },
    );
  }

  if (team.status === "DISQUALIFIED") {
    return NextResponse.json(
      { ok: false, error: `${team.code} is disqualified — see an organiser.`, reason: "DISQUALIFIED", team },
      { status: 409 },
    );
  }

  // The registration checkpoint also moves the team into CHECKED_IN.
  const nextStatus: TeamStatus | undefined =
    checkpoint === "REGISTRATION" && (team.status === "CONFIRMED" || team.status === "PENDING")
      ? "CHECKED_IN"
      : undefined;

  const { submissionDeadline } = await getSettings();
  if (checkpoint === "SUBMISSION" && new Date(submissionDeadline).getTime() <= Date.now()) {
    return NextResponse.json(
      {
        ok: false,
        error: "The submission deadline has passed. An organiser must log this manually.",
        reason: "DEADLINE_PASSED",
        team,
      },
      { status: 409 },
    );
  }

  const already = await prisma.checkpointLog.findFirst({
    where: { teamId: team.id, checkpoint: checkpoint as CheckpointName },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, note: true, notedBy: true },
  });

  const recorder = notedBy?.trim() || auth.actor.name;

  if (already && !teamId) {
    // Re-scanning the same code must stay idempotent: volunteers work through a
    // queue and will hit the same team twice. Report, don't duplicate.
    return NextResponse.json({
      ok: true,
      duplicate: true,
      team,
      message: `${team.code} already logged for this checkpoint.`,
      loggedAt: already.createdAt,
    });
  }

  const [log] = await prisma.$transaction([
    // Manual entry from the board edits in place so a corrected note doesn't
    // leave a stale duplicate row behind.
    already
      ? prisma.checkpointLog.update({
          where: { id: already.id },
          data: { note, notedBy: recorder, scannedById: auth.actor.id },
          select: { id: true, createdAt: true },
        })
      : prisma.checkpointLog.create({
          data: {
            teamId: team.id,
            checkpoint: checkpoint as CheckpointName,
            note,
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
    team: { ...team, status: nextStatus ?? team.status },
    loggedAt: log!.createdAt,
  });
}

/** Recent scans, for the volunteer's "last few" list. */
export async function GET() {
  const auth = await guard("checkin", "read");
  if ("response" in auth) return auth.response;

  const recent = await prisma.checkpointLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 25,
    select: {
      id: true,
      checkpoint: true,
      createdAt: true,
      notedBy: true,
      team: { select: { code: true, name: true, track: { select: { name: true } } } },
    },
  });

  return NextResponse.json({ ok: true, recent });
}
