import "server-only";
import { prisma } from "@/lib/prisma";
import { sendTemplatedEmail } from "@/lib/email/send";
import { buildVars } from "@/lib/email/vars";
import { bulkSendSchema } from "@/lib/validation";
import { getSettings } from "@/lib/settings";
import type { CommType, TeamStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

/**
 * Resolves the audience for a bulk send, then sends one templated email per
 * team. Sequential on purpose: bulk mail should not trip provider rate limits.
 */
export async function sendBulk(input: unknown, sentById: string) {
  const parsed = bulkSendSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: parsed.error.issues[0]?.message ?? "Invalid campaign." };
  }
  const { templateKey, type, trackId, status, checkpoint, limit } = parsed.data;

  const where: Prisma.TeamWhereInput = {};
  if (trackId) where.trackId = trackId;
  if (status) where.status = status as TeamStatus;
  if (checkpoint) {
    where.checkpoints = { some: { checkpoint: checkpoint as never } };
  }

  const teams = await prisma.team.findMany({
    where,
    take: limit,
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      name: true,
      code: true,
      college: true,
      city: true,
      contactName: true,
      contactEmail: true,
      track: { select: { name: true } },
      _count: { select: { participants: true } },
    },
  });

  if (teams.length === 0) {
    return { ok: false as const, error: "No teams match those filters." };
  }

  const { submissionDeadline } = await getSettings();
  let sent = 0;
  let failed = 0;

  for (const team of teams) {
    const vars = await buildVars(team, { checkpoint: checkpoint ?? "checkpoint" });
    const result = await sendTemplatedEmail({
      templateKey,
      type: type as CommType,
      teamId: team.id,
      to: team.contactEmail,
      recipientName: team.contactName,
      vars,
      sentById,
    });
    if (result.status === "FAILED") failed += 1;
    else sent += 1;
  }

  return {
    ok: true as const,
    matched: teams.length,
    sent,
    failed,
    deadline: submissionDeadline,
  };
}
