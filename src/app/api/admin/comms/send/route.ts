import { NextResponse } from "next/server";
import { guard, fail } from "@/lib/http";
import { sendBulk } from "@/lib/mail-send";
import { audit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const auth = await guard("comms", "write");
  if ("response" in auth) return auth.response;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail(400, "Invalid request.");
  }

  const result = await sendBulk(raw, auth.actor.id);
  if (!result.ok) return fail(422, result.error);

  await audit({
    actorId: auth.actor.id,
    actorEmail: auth.actor.email,
    action: "comms.bulk_send",
    entityType: "campaign",
    entityId: String((raw as { templateKey?: string }).templateKey ?? "unknown"),
    after: { matched: result.matched, sent: result.sent, failed: result.failed },
  });

  return NextResponse.json(result);
}
