import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { draftSchema } from "@/lib/validation";
import { makeDraftToken } from "@/lib/registration";

export const dynamic = "force-dynamic";

/** Save progress so a student can close the tab and come back. */
export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid request." }, { status: 400 });
  }

  const parsed = draftSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid draft." },
      { status: 422 },
    );
  }

  const { email, step, payload } = parsed.data;
  const existing = await prisma.registrationDraft.findFirst({
    where: { email },
    orderBy: { updatedAt: "desc" },
  });

  if (existing) {
    const updated = await prisma.registrationDraft.update({
      where: { id: existing.id },
      data: { step, payload: JSON.parse(JSON.stringify(payload)) },
      select: { resumeToken: true, step: true, updatedAt: true },
    });
    return NextResponse.json({ ok: true, resumed: true, ...updated });
  }

  const created = await prisma.registrationDraft.create({
    data: {
      resumeToken: makeDraftToken(),
      email,
      step,
      payload: JSON.parse(JSON.stringify(payload)),
    },
    select: { resumeToken: true, step: true, updatedAt: true },
  });

  return NextResponse.json({ ok: true, resumed: false, ...created });
}

/** Look up a saved draft by its resume token. */
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ ok: false, error: "Missing token." }, { status: 400 });

  const draft = await prisma.registrationDraft.findUnique({
    where: { resumeToken: token },
    select: { email: true, step: true, payload: true, updatedAt: true },
  });

  if (!draft) return NextResponse.json({ ok: false, error: "Draft not found or expired." }, { status: 404 });
  return NextResponse.json({ ok: true, draft });
}

export async function DELETE(req: Request) {
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return NextResponse.json({ ok: false, error: "Missing token." }, { status: 400 });
  await prisma.registrationDraft.deleteMany({ where: { resumeToken: token } });
  return NextResponse.json({ ok: true });
}
