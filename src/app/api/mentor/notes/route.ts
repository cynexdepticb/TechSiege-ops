import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { fail, zodFail } from "@/lib/http";
import { getActor } from "@/lib/guards";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

const mentorNotesSchema = z.object({
  assignmentId: z.string().min(1),
  notes: z.string().trim().max(8000),
});

/**
 * Mentor checkpoint feedback. Scoped the same way scoring is: the caller must
 * be a mentor, must hold a PanelMember record, and the assignment being edited
 * must be theirs.
 */
export async function POST(req: Request) {
  const actor = await getActor();
  if (!actor) return fail(401, "Not signed in.");
  if (actor.role !== "MENTOR") return fail(403, "Only mentors can record feedback.");

  const member = await prisma.panelMember.findFirst({
    where: { userId: actor.id, kind: "MENTOR" },
    select: { id: true },
  });
  if (!member) return fail(403, "Your mentor record is missing.");

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail(400, "Invalid request.");
  }

  const parsed = mentorNotesSchema.safeParse(raw);
  if (!parsed.success) return zodFail(parsed.error);
  const { assignmentId, notes } = parsed.data;

  const assignment = await prisma.assignment.findFirst({
    where: { id: assignmentId, panelId: member.id },
    select: { id: true, notes: true, team: { select: { name: true } } },
  });
  if (!assignment) return fail(403, "That assignment does not belong to you.");

  const updated = await prisma.assignment.update({
    where: { id: assignmentId },
    data: { notes },
    select: { id: true, notes: true, updatedAt: true },
  });

  await audit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: "assignment.notes",
    entityType: "assignment",
    entityId: assignmentId,
    before: { notes: assignment.notes },
    after: { notes, team: assignment.team?.name },
  });

  return NextResponse.json({ ok: true, assignment: updated });
}
