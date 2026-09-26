import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { fail, guard } from "@/lib/http";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Permanently removes a team and everything that belongs to it.
 *
 * Scores, submissions and check-in logs cascade at the database level, so
 * deleting a team that has them destroys judged results with no way back. The
 * route therefore refuses by default and says exactly what blocks it.
 *
 * `force` overrides that refusal. It exists because the common case is cleaning
 * up a real registration that already has check-in history, and a delete button
 * that is permanently greyed out is useless. The override is deliberate, not
 * silent: the UI states what will be destroyed, the code must still be typed,
 * and the audit entry records that history was destroyed and by how much.
 *
 * Everything belonging to the team is removed explicitly rather than left
 * orphaned by `onDelete: SetNull`.
 */
export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await guard("teams", "write");
  if ("response" in auth) return auth.response;

  const { id } = await ctx.params;

  let force = false;
  try {
    // A body is optional here, so an empty DELETE must not be treated as bad JSON.
    const text = await req.text();
    force = text ? Boolean((JSON.parse(text) as { force?: unknown }).force) : false;
  } catch {
    return fail(400, "Invalid request.");
  }

  const team = await prisma.team.findUnique({
    where: { id },
    select: {
      id: true,
      code: true,
      name: true,
      contactEmail: true,
      status: true,
      _count: { select: { scores: true, checkpoints: true, participants: true, comms: true, assignments: true } },
      submission: { select: { id: true } },
    },
  });
  if (!team) return fail(404, "Team not found.");

  const blockers: string[] = [];
  if (team._count.scores > 0) blockers.push(`${team._count.scores} score(s)`);
  if (team.submission) blockers.push("a submission");
  if (team._count.checkpoints > 0) blockers.push(`${team._count.checkpoints} check-in log(s)`);

  if (blockers.length > 0 && !force) {
    return fail(
      409,
      `${team.code} has ${blockers.join(", ")}, which would be destroyed and cannot be restored. Confirm again to delete it anyway, or set the status to Disqualified to keep the record and remove it from the running.`,
    );
  }

  const destroyed = {
    scores: team._count.scores,
    checkpoints: team._count.checkpoints,
    submission: Boolean(team.submission),
  };

  const deleted = await prisma.$transaction(async (tx) => {
    // Explicit, so nothing survives as an orphan pointing at a missing team.
    await tx.analyticsEvent.deleteMany({ where: { teamId: id } });
    await tx.participant.deleteMany({ where: { teamId: id } });
    await tx.communicationLog.deleteMany({ where: { teamId: id } });
    await tx.assignment.deleteMany({ where: { teamId: id } });
    return tx.team.delete({ where: { id }, select: { id: true } });
  });

  await audit({
    actorId: auth.actor.id,
    actorEmail: auth.actor.email,
    action: force ? "team.delete.forced" : "team.delete",
    entityType: "team",
    entityId: id,
    before: {
      code: team.code,
      name: team.name,
      contactEmail: team.contactEmail,
      status: team.status,
      participants: team._count.participants,
      emailsSent: team._count.comms,
      panelAssignments: team._count.assignments,
    },
    after: { forced: force, historyDestroyed: force ? destroyed : null },
  });

  revalidatePath("/admin/teams");
  revalidatePath(`/admin/teams/${id}`);

  return NextResponse.json({
    ok: true,
    deleted: deleted.id,
    code: team.code,
    forced: force,
    historyDestroyed: force ? destroyed : null,
  });
}
