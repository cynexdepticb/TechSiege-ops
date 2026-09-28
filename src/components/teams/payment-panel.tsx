"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  BadgeIndianRupee,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Mail,
  Send,
  XCircle,
} from "lucide-react";

export type ParticipantItem = {
  id: string;
  name: string;
  role: string;
  ticketId?: string | null;
  pdfFilename?: string | null;
};

export function PaymentPanel({
  team,
  defaultAmount,
}: {
  team: {
    id: string;
    code: string;
    name: string;
    status: string;
    memberCount: number;
    paymentStatus: "UNPAID" | "PAID";
    amountPaid: string | null;
    paymentRef: string;
    paidAt: string | null;
    ticketSentAt: string | null;
    ticketEmailStatus?: "NOT_SENT" | "SENT" | "FAILED";
    ticketEmailLastError?: string;
    participants?: ParticipantItem[];
  };
  defaultAmount: string;
}) {
  const router = useRouter();
  const paid = team.paymentStatus === "PAID";
  const emailStatus = team.ticketEmailStatus ?? (team.ticketSentAt ? "SENT" : "NOT_SENT");

  const [amount, setAmount] = useState(defaultAmount);
  const [ref, setRef] = useState(team.paymentRef);
  const [busy, setBusy] = useState<"paid" | "resend" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleVerifyPayment() {
    setBusy("paid");
    setError(null);
    try {
      const res = await fetch(`/api/admin/teams/${team.id}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "mark-paid",
          amountPaid: amount.trim() === "" ? null : Number(amount),
          paymentRef: ref.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Failed to verify payment.");
        return;
      }

      if (data.sent > 0) {
        toast.success(`Payment verified · ${team.code}`, {
          description: `All ${team.memberCount} member ticket PDFs generated & emailed to team leader.`,
        });
      } else {
        toast.warning(`Payment verified · Tickets ready`, {
          description: `Tickets generated, but email delivery had issues: ${data.reason || "check address"}. You can use RESEND TICKETS.`,
        });
      }
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(null);
    }
  }

  async function handleResendTickets() {
    setBusy("resend");
    setError(null);
    try {
      const res = await fetch(`/api/admin/teams/${team.id}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resend-tickets" }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "Failed to resend tickets.");
        return;
      }

      if (data.sent > 0) {
        toast.success(`Tickets resent · ${team.code}`, {
          description: `Confirmation email with all ${team.memberCount} member ticket PDFs delivered.`,
        });
      } else {
        toast.error(`Resend failed`, {
          description: data.reason || "Could not deliver email to team leader.",
        });
      }
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="border-border">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div>
          <CardTitle className="text-base font-semibold">Payment &amp; Ticket Status</CardTitle>
          <CardDescription className="text-xs">
            Payment verification automatically generates individual member ticket PDFs and delivers them to the team leader.
          </CardDescription>
        </div>
        <Badge variant={paid ? "default" : "secondary"} className="shrink-0">
          {paid ? "Paid" : "Unpaid"}
        </Badge>
      </CardHeader>

      <CardContent className="space-y-4">
        {paid ? (
          <>
            {/* Status Checklist */}
            <div className="rounded-lg border border-border bg-card/60 p-3 space-y-2 text-xs">
              <div className="font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                Verification &amp; Delivery Workflow
              </div>

              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>Payment Verified</span>
              </div>

              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>Registration Confirmed</span>
              </div>

              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>{team.memberCount} Tickets Generated</span>
              </div>

              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 className="size-4 shrink-0" />
                <span>Ticket PDFs Ready</span>
              </div>

              {emailStatus === "SENT" ? (
                <div className="flex items-center gap-2 text-emerald-400">
                  <CheckCircle2 className="size-4 shrink-0" />
                  <span>Confirmation Email Sent with {team.memberCount} PDF attachment(s)</span>
                </div>
              ) : emailStatus === "FAILED" ? (
                <div className="flex items-start gap-2 text-destructive">
                  <XCircle className="size-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Confirmation Email Failed</span>
                    {team.ticketEmailLastError ? (
                      <p className="text-[11px] text-destructive/80 mt-0.5">{team.ticketEmailLastError}</p>
                    ) : null}
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-amber-400">
                  <Mail className="size-4 shrink-0" />
                  <span>Confirmation Email Queued</span>
                </div>
              )}
            </div>

            {/* Payment Details */}
            <dl className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2 rounded-md bg-muted/30 p-2.5">
              <Field label="Amount" value={team.amountPaid ? `₹${team.amountPaid}` : "Not recorded"} />
              <Field label="Reference" value={team.paymentRef || "—"} />
              <Field
                label="Confirmed"
                value={team.paidAt ? new Date(team.paidAt).toLocaleString("en-IN") : "—"}
              />
              <Field
                label="Email Sent"
                value={
                  team.ticketSentAt
                    ? new Date(team.ticketSentAt).toLocaleString("en-IN")
                    : "Pending delivery"
                }
              />
            </dl>

            {/* Member Ticket Downloads */}
            {team.participants && team.participants.length > 0 ? (
              <div className="space-y-1.5 pt-1">
                <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider text-[10px]">
                  Member Admission Tickets
                </div>
                <div className="space-y-1.5">
                  {team.participants.map((p) => (
                    <div
                      key={p.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 rounded-md border border-border/60 bg-muted/20 px-2.5 py-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-medium truncate flex items-center gap-1.5">
                          <span>{p.name}</span>
                          {p.role === "LEADER" ? (
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider font-normal">
                              (Lead)
                            </span>
                          ) : null}
                        </div>
                        {p.ticketId ? (
                          <div className="font-mono text-[11px] text-cyan-400">
                            {p.ticketId}
                          </div>
                        ) : null}
                      </div>

                      <a
                        href={`/api/admin/participants/${p.id}/pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex self-start sm:self-auto shrink-0 items-center gap-1 rounded bg-secondary px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-secondary/80 border border-border/80 transition-colors"
                      >
                        <Download className="size-3" />
                        Download PDF
                      </a>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Action Buttons */}
            <div className="flex flex-wrap gap-2 pt-2">
              <Button
                onClick={handleResendTickets}
                disabled={busy !== null}
                className="w-full bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs h-9"
              >
                {busy === "resend" ? (
                  <Loader2 className="size-4 animate-spin mr-1.5" />
                ) : (
                  <Send className="size-4 mr-1.5" />
                )}
                RESEND TICKETS
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
              Payment is pending. Confirming fee will approve registration, mint individual ticket IDs, render PDF admission passes, and email them to the team leader.
            </p>

            <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
              <div className="space-y-1">
                <Label htmlFor="pay-amount" className="text-xs text-muted-foreground">
                  Amount (₹)
                </Label>
                <Input
                  id="pay-amount"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="1500"
                  disabled={busy !== null}
                  className="h-8 text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pay-ref" className="text-xs text-muted-foreground">
                  UPI / Bank Reference
                </Label>
                <Input
                  id="pay-ref"
                  value={ref}
                  onChange={(e) => setRef(e.target.value)}
                  placeholder="UPI ref, cheque no., or cash"
                  disabled={busy !== null}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <Button
              onClick={handleVerifyPayment}
              disabled={busy !== null}
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs h-9"
            >
              {busy === "paid" ? (
                <Loader2 className="size-4 animate-spin mr-1.5" />
              ) : (
                <BadgeIndianRupee className="size-4 mr-1.5" />
              )}
              VERIFY PAYMENT &amp; ISSUE TICKETS
            </Button>
          </>
        )}

        {error ? (
          <p role="alert" className="text-xs text-destructive bg-destructive/10 p-2 rounded border border-destructive/30">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="shrink-0 text-muted-foreground">{label}:</dt>
      <dd className="truncate font-medium text-foreground">{value}</dd>
    </div>
  );
}
