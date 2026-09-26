import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { fail, guard, zodFail } from "@/lib/http";
import { panelMemberSchema, volunteerSchema } from "@/lib/validation";
import { audit, diff } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Panel roster and volunteer shifts. `kind`/`entity` pick which of the two
 * records is being written, because the shapes are unrelated and only ever
 * sent one at a time from the roster page.
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

  const entity = (raw as { entity?: string }).entity ?? "panel";
  if (entity === "volunteer") return volunteer(auth.actor, raw);
  return panelMember(auth.actor, raw);
}

type Actor = { id: string; email: string };

async function panelMember(actor: Actor, raw: unknown) {
  const parsed = panelMemberSchema.safeParse(raw);
  if (!parsed.success) return zodFail(parsed.error as ZodError);
  const input = parsed.data;

  if (!input.id) {
    const existing = await prisma.panelMember.findUnique({ where: { email: input.email } });
    if (existing) return fail(409, "Someone on the panel already uses that email.");

    const member = await prisma.panelMember.create({
      data: {
        kind: input.kind,
        name: input.name,
        email: input.email,
        org: input.org || null,
        title: input.title || null,
        phone: input.phone || null,
        bio: input.bio || null,
        confirmed: input.confirmed,
        active: input.active,
      },
    });

    await audit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "panelMember.create",
      entityType: "panelMember",
      entityId: member.id,
      after: { name: member.name, kind: member.kind, email: member.email },
    });

    return NextResponse.json({ ok: true, member });
  }

  const before = await prisma.panelMember.findUnique({
    where: { id: input.id },
    select: {
      name: true,
      email: true,
      kind: true,
      org: true,
      title: true,
      phone: true,
      confirmed: true,
      active: true,
    },
  });
  if (!before) return fail(404, "Panel member not found.");

  // The email is the portal link: changing it on a member who has a login
  // would leave the two disagreeing about who they are.
  const emailTaken =
    input.email !== before.email
      ? await prisma.panelMember.findUnique({ where: { email: input.email } })
      : null;
  if (emailTaken) return fail(409, "Someone else on the panel already uses that email.");

  const member = await prisma.panelMember.update({
    where: { id: input.id },
    data: {
      name: input.name,
      email: input.email,
      kind: input.kind,
      org: input.org || null,
      title: input.title || null,
      phone: input.phone || null,
      bio: input.bio || null,
      confirmed: input.confirmed,
      active: input.active,
    },
  });

  await audit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: "panelMember.update",
    entityType: "panelMember",
    entityId: member.id,
    ...diff(before, {
      name: member.name,
      email: member.email,
      kind: member.kind,
      org: member.org,
      title: member.title,
      phone: member.phone,
      confirmed: member.confirmed,
      active: member.active,
    }),
  });

  return NextResponse.json({ ok: true, member });
}

async function volunteer(actor: Actor, raw: unknown) {
  const parsed = volunteerSchema.safeParse(raw);
  if (!parsed.success) return zodFail(parsed.error as ZodError);
  const input = parsed.data;

  if (!input.id) {
    const created = await prisma.volunteer.create({
      data: {
        name: input.name,
        email: input.email || null,
        phone: input.phone || null,
        shift: input.shift,
        station: input.station,
      },
    });

    await audit({
      actorId: actor.id,
      actorEmail: actor.email,
      action: "volunteer.create",
      entityType: "volunteer",
      entityId: created.id,
      after: { name: created.name, station: created.station, shift: created.shift },
    });

    return NextResponse.json({ ok: true, volunteer: created });
  }

  const before = await prisma.volunteer.findUnique({
    where: { id: input.id },
    select: { name: true, email: true, phone: true, shift: true, station: true },
  });
  if (!before) return fail(404, "Volunteer not found.");

  const updated = await prisma.volunteer.update({
    where: { id: input.id },
    data: {
      name: input.name,
      email: input.email || null,
      phone: input.phone || null,
      shift: input.shift,
      station: input.station,
    },
  });

  await audit({
    actorId: actor.id,
    actorEmail: actor.email,
    action: "volunteer.update",
    entityType: "volunteer",
    entityId: updated.id,
    ...diff(before, {
      name: updated.name,
      email: updated.email,
      phone: updated.phone,
      shift: updated.shift,
      station: updated.station,
    }),
  });

  return NextResponse.json({ ok: true, volunteer: updated });
}
