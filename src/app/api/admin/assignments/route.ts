import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { fail, guard, zodFail } from "@/lib/http";
import { assignmentSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Binds panel members to the teams they judge or mentor. Nothing in the app
 * creates these — a panel member with no assignments signs in to an empty
 * portal — so the roster page is the only place this can be done.
 */
export async function POST(req: Request) {
  const auth = await guard("panel", "write");
  if ("response" in auth) return auth.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail(400, "Invalid request.");
  }

  const parsed = assignmentSchema.safeParse(raw);
  if (!parsed.success) return zodFail(parsed.error as ZodError);
  const { panelId, teamId } = parsed.data;

  const [member, team] = await Promise.all([
    prisma.panelMember.findUnique({
      where: { id: panelId },
      select: { id: true, name: true, kind: true, active: true },
    }),
    prisma.team.findUnique({ where: { id: teamId }, select: { id: true, code: true } }),
  ]);
  if (!member) return fail(404, "Panel member not found.");
  if (!team) return fail(404, "Team not found.");
  if (!member.active) return fail(409, `${member.name} is marked inactive on the panel.`);

  const existing = await prisma.assignment.findFirst({
    where: { panelId, teamId, trackId: null },
    select: { id: true },
  });
  if (existing) return NextResponse.json({ ok: true, unchanged: true, id: existing.id });

  const assignment = await prisma.assignment.create({
    data: { panelId, teamId, trackId: null },
    select: { id: true },
  });

  await audit({
    actorId: auth.actor.id,
    actorEmail: auth.actor.email,
    action: "assignment.create",
    entityType: "assignment",
    entityId: assignment.id,
    after: { panel: member.name, kind: member.kind, team: team.code },
  });

  return NextResponse.json({ ok: true, id: assignment.id });
}

/** Unassign a team. Any scores already recorded against the pairing are kept
 *  in the leaderboard — removing an assignment is not a request to discard
 *  a judge's work. */
export async function DELETE(req: Request) {
  const auth = await guard("panel", "write");
  if ("response" in auth) return auth.response;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return fail(422, "id is required.");

  const before = await prisma.assignment.findUnique({
    where: { id },
    select: {
      id: true,
      panel: { select: { name: true } },
      team: { select: { code: true } },
    },
  });
  if (!before) return fail(404, "Assignment not found.");

  await prisma.assignment.delete({ where: { id } });

  await audit({
    actorId: auth.actor.id,
    actorEmail: auth.actor.email,
    action: "assignment.delete",
    entityType: "assignment",
    entityId: id,
    before: { panel: before.panel.name, team: before.team?.code },
  });

  return NextResponse.json({ ok: true });
}
