import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { fail, guard, zodFail } from "@/lib/http";
import { markTeamPaid, sendTeamTicket } from "@/lib/payment";
import { paymentSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

/**
 * POST /api/admin/teams/[id]/payment
 *
 *   { action: "mark-paid", amountPaid?: number, paymentRef?: string }
 *   { action: "send-ticket" }
 *
 * Both actions send email, so both can partially fail: the payment or the
 * `ticketSentAt` stamp is committed and the send is reported per address. The
 * response distinguishes "done" from "done, but these people were not reached",
 * because an organiser who needs to chase a transfer by hand has to know that
 * from the response rather than by noticing a bounce later.
 */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const auth = await guard("teams", "write");
  if ("response" in auth) return auth.response;

  const { id } = await ctx.params;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return fail(400, "Invalid request.");
  }

  const parsed = paymentSchema.safeParse(raw);
  if (!parsed.success) return zodFail(parsed.error as ZodError);
  const input = parsed.data;

  if (input.action === "send-ticket" || input.action === "resend-tickets") {
    const result = await sendTeamTicket({
      teamId: id,
      actorId: auth.actor.id,
      actorEmail: auth.actor.email,
    });
    if (!result.ok) return fail(409, result.reason ?? "Could not issue the ticket.");
    return NextResponse.json({ ...result, ok: true });
  }

  const result = await markTeamPaid({
    teamId: id,
    amountPaid: input.amountPaid,
    paymentRef: input.paymentRef,
    actorId: auth.actor.id,
    actorEmail: auth.actor.email,
  });
  if (!result.ok) return fail(404, result.reason ?? "Could not record the payment.");

  return NextResponse.json({ ...result, ok: true });
}
