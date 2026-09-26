import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { fail, guard, zodFail } from "@/lib/http";
import { trackSchema } from "@/lib/validation";
import { audit, diff } from "@/lib/audit";
import { slugify } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Create a track, or edit an existing one. Tracks are base config: public
 * registration reads them to build its track picker, so an event with no
 * tracks cannot accept a single team.
 */
export async function POST(req: Request) {
  const auth = await guard("tracks", "write");
  if ("response" in auth) return auth.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail(400, "Invalid request.");
  }

  const parsed = trackSchema.safeParse(raw);
  if (!parsed.success) return zodFail(parsed.error as ZodError);
  const input = parsed.data;

  if (!input.id) {
    const slug = slugify(input.name);
    if (!slug) return fail(422, "Enter a track name made of letters or numbers.");

    const clash = await prisma.track.findUnique({ where: { slug } });
    if (clash) {
      return fail(409, `A track called "${clash.name}" already uses that name.`);
    }

    const track = await prisma.track.create({
      data: {
        slug,
        name: input.name,
        description: input.description,
        requirementChecklist: input.requirementChecklist,
        capacity: input.capacity,
        sortOrder: input.sortOrder,
        active: input.active,
      },
    });

    await audit({
      actorId: auth.actor.id,
      actorEmail: auth.actor.email,
      action: "track.create",
      entityType: "track",
      entityId: track.id,
      after: { name: track.name, capacity: track.capacity, active: track.active },
    });

    return NextResponse.json({ ok: true, track });
  }

  const before = await prisma.track.findUnique({
    where: { id: input.id },
    select: {
      name: true,
      description: true,
      requirementChecklist: true,
      capacity: true,
      sortOrder: true,
      active: true,
    },
  });
  if (!before) return fail(404, "Track not found.");

  // Lowering capacity below the teams already registered would silently
  // oversubscribe the track, so refuse rather than accept a broken promise.
  if (input.capacity !== null) {
    const taken = await prisma.team.count({ where: { trackId: input.id } });
    if (input.capacity < taken) {
      return fail(
        409,
        `${taken} teams are already in this track — capacity cannot go below ${taken}.`,
      );
    }
  }

  const track = await prisma.track.update({
    where: { id: input.id },
    data: {
      name: input.name,
      description: input.description,
      requirementChecklist: input.requirementChecklist,
      capacity: input.capacity,
      sortOrder: input.sortOrder,
      active: input.active,
    },
  });

  await audit({
    actorId: auth.actor.id,
    actorEmail: auth.actor.email,
    action: "track.update",
    entityType: "track",
    entityId: track.id,
    ...diff(before, {
      name: track.name,
      description: track.description,
      requirementChecklist: track.requirementChecklist,
      capacity: track.capacity,
      sortOrder: track.sortOrder,
      active: track.active,
    }),
  });

  return NextResponse.json({ ok: true, track });
}
