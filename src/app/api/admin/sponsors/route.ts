import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fail, guard, zodFail } from "@/lib/http";
import { sponsorSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";
import type { ZodError } from "zod";
import { SponsorStatus } from "@/generated/prisma/enums";

export const dynamic = "force-dynamic";

/** Create a sponsor, or move an existing one along the pipeline. */
export async function POST(req: Request) {
  const auth = await guard("sponsors", "write");
  if ("response" in auth) return auth.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail(400, "Invalid request.");
  }

  const parsed = sponsorSchema.safeParse(raw);
  if (!parsed.success) return zodFail(parsed.error as ZodError);
  const input = parsed.data;

  if (!input.id) {
    const sponsor = await prisma.sponsor.create({
      data: {
        name: input.name,
        tier: input.tier,
        status: input.status,
        amount: input.amount ?? null,
        currency: input.currency ?? "INR",
        contactPerson: input.contactPerson ?? "",
        contactEmail: input.contactEmail ?? "",
        notes: input.notes ?? "",
        ownerId: input.ownerId || auth.actor.id,
        confirmedAt:
          input.status === SponsorStatus.CONFIRMED || input.status === SponsorStatus.PAID
            ? new Date()
            : null,
        paidAt: input.status === SponsorStatus.PAID ? new Date() : null,
      },
    });

    await audit({
      actorId: auth.actor.id,
      actorEmail: auth.actor.email,
      action: "sponsor.create",
      entityType: "sponsor",
      entityId: sponsor.id,
      after: { name: sponsor.name, tier: sponsor.tier, status: sponsor.status },
    });

    return NextResponse.json({ ok: true, sponsor });
  }

  const before = await prisma.sponsor.findUnique({
    where: { id: input.id },
    select: {
      name: true,
      tier: true,
      status: true,
      amount: true,
      confirmedAt: true,
      paidAt: true,
    },
  });
  if (!before) return fail(404, "Sponsor not found.");

  const stamp = (reached: boolean, already: Date | null) => {
    if (!reached) return null;
    return already ?? new Date();
  };

  const sponsor = await prisma.sponsor.update({
    where: { id: input.id },
    data: {
      name: input.name,
      tier: input.tier,
      status: input.status,
      amount: input.amount ?? null,
      contactPerson: input.contactPerson ?? "",
      contactEmail: input.contactEmail ?? "",
      notes: input.notes ?? "",
      ...(input.ownerId ? { ownerId: input.ownerId } : {}),
      // Stamp each milestone the first time it is reached, and keep the
      // original date if a sponsor later moves back down the pipeline.
      confirmedAt: stamp(
        input.status === SponsorStatus.CONFIRMED || input.status === SponsorStatus.PAID,
        before.confirmedAt,
      ),
      paidAt: stamp(input.status === SponsorStatus.PAID, before.paidAt),
    },
  });

  await audit({
    actorId: auth.actor.id,
    actorEmail: auth.actor.email,
    action: "sponsor.update",
    entityType: "sponsor",
    entityId: sponsor.id,
    before,
    after: { name: sponsor.name, tier: sponsor.tier, status: sponsor.status },
  });

  return NextResponse.json({ ok: true, sponsor });
}
