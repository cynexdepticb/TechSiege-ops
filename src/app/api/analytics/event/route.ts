import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { eventSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/** Funnel beacon. Fails silently — analytics must never break registration. */
export async function POST(req: Request) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const parsed = eventSchema.safeParse(raw);
  if (!parsed.success) return NextResponse.json({ ok: true }, { status: 202 });

  try {
    await prisma.analyticsEvent.create({
      data: {
        type: parsed.data.type,
        path: parsed.data.path,
        visitorId: parsed.data.visitorId,
        step: parsed.data.step,
        teamId: parsed.data.teamId,
      },
    });
  } catch (e) {
    console.error("[analytics]", e);
  }

  return NextResponse.json({ ok: true }, { status: 202 });
}
