import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { fail, zodFail } from "@/lib/http";
import { getActor } from "@/lib/guards";
import { scoreSchema } from "@/lib/validation";
import { CRITERIA } from "@/lib/site";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Judge score submission.
 *
 * Three checks matter here, in order:
 *  1. the caller is a judge (staff cannot post scores on someone's behalf),
 *  2. they hold a PanelMember record (a judge login without one is misconfigured),
 *  3. they are assigned to the team being scored.
 *
 * The weighted total is recomputed here from the submitted raw scores. The
 * client also shows a running total, but that is a preview — if the two ever
 * disagree, the server value is what gets stored.
 */
export async function POST(req: Request) {
  const actor = await getActor();
  if (!actor) return fail(401, "Not signed in.");
  if (actor.role !== "JUDGE") {
    return fail(403, "Only judges can submit scores.");
  }

  const member = await prisma.panelMember.findFirst({
    where: { userId: actor.id, kind: "JUDGE" },
    select: { id: true, name: true, active: true },
  });
  if (!member || !member.active) {
    return fail(403, "Your judge record is missing or inactive.");
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail(400, "Invalid request.");
  }

  const parsed = scoreSchema.safeParse(raw);
  if (!parsed.success) return zodFail(parsed.error as ZodError);
  const input = parsed.data;

  // The assignment is the authorisation boundary: a judge cannot score a team
  // they were not given, even by guessing a valid team id.
  const assignment = await prisma.assignment.findFirst({
    where: { panelId: member.id, teamId: input.teamId },
    select: { id: true },
  });
  if (!assignment) {
    return fail(403, "You are not assigned to that team.");
  }

  const total = CRITERIA.reduce(
    (sum, c) => sum + Number(input[c.key]) * c.weight,
    0,
  );

  const before = await prisma.score.findFirst({
    where: { judgeId: member.id, teamId: input.teamId },
    select: { id: true, totalWeightedScore: true },
  });

  const score = await prisma.score.upsert({
    where: { judgeId_teamId: { judgeId: member.id, teamId: input.teamId } },
    create: {
      judgeId: member.id,
      teamId: input.teamId,
      agenticCapability: input.agenticCapability,
      innovation: input.innovation,
      technicalImplementation: input.technicalImplementation,
      problemRelevance: input.problemRelevance,
      userExperience: input.userExperience,
      demoPresentation: input.demoPresentation,
      totalWeightedScore: Math.round(total * 100) / 100,
      comments: input.comments,
    },
    update: {
      agenticCapability: input.agenticCapability,
      innovation: input.innovation,
      technicalImplementation: input.technicalImplementation,
      problemRelevance: input.problemRelevance,
      userExperience: input.userExperience,
      demoPresentation: input.demoPresentation,
      totalWeightedScore: Math.round(total * 100) / 100,
      comments: input.comments,
    },
    select: { id: true, totalWeightedScore: true },
  });

  await audit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: before ? "score.update" : "score.create",
    entityType: "score",
    entityId: score.id,
    before: before ? { totalWeightedScore: before.totalWeightedScore } : undefined,
    after: { teamId: input.teamId, totalWeightedScore: score.totalWeightedScore },
  });

  return NextResponse.json({
    ok: true,
    score,
    created: !before,
    total: score.totalWeightedScore,
  });
}
