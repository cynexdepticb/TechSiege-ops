import { NextResponse } from "next/server";
import type { ZodError } from "zod";
import { prisma } from "@/lib/prisma";
import { fail, guard, zodFail } from "@/lib/http";
import { templateSchema } from "@/lib/validation";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

/**
 * Create a template, or update an existing one's copy.
 *
 * The `key` is immutable once created — campaigns reference it, so renaming it
 * would silently break every scheduled send.
 */
export async function POST(req: Request) {
  const auth = await guard("comms", "write");
  if ("response" in auth) return auth.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail(400, "Invalid request.");
  }

  const parsed = templateSchema.safeParse(raw);
  if (!parsed.success) return zodFail(parsed.error as ZodError);
  const input = parsed.data;

  if (!input.id) {
    const existing = await prisma.emailTemplate.findUnique({ where: { key: input.key } });
    if (existing) return fail(409, `A template already uses the key "${input.key}".`);

    const template = await prisma.emailTemplate.create({
      data: {
        key: input.key,
        name: input.name,
        type: input.type,
        subject: input.subject,
        body: input.body,
        active: input.active,
      },
      select: { id: true, key: true, name: true, active: true },
    });

    await audit({
      actorId: auth.actor.id,
      actorEmail: auth.actor.email,
      action: "template.create",
      entityType: "emailTemplate",
      entityId: template.id,
      after: { key: template.key, name: template.name },
    });

    return NextResponse.json({ ok: true, template });
  }

  const id = input.id;

  const before = await prisma.emailTemplate.findUnique({
    where: { id },
    select: { key: true, name: true, type: true, subject: true, active: true },
  });
  if (!before) return fail(404, "Template not found.");

  const template = await prisma.emailTemplate.update({
    where: { id },
    data: {
      name: input.name,
      type: input.type,
      subject: input.subject,
      body: input.body,
      active: input.active,
    },
    select: { id: true, key: true, name: true, type: true, active: true },
  });

  await audit({
    actorId: auth.actor.id,
    actorEmail: auth.actor.email,
    action: "template.update",
    entityType: "emailTemplate",
    entityId: id,
    before,
    after: { name: template.name, type: template.type, subject: input.subject, active: template.active },
  });

  return NextResponse.json({ ok: true, template });
}
