"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { BadgeIndianRupee, Loader2 } from "lucide-react";

/**
 * Row-level "mark paid" for the teams table, so an organiser working the
 * unpaid queue does not have to open every team detail page. Same API and
 * same semantics as the PaymentPanel's "Mark as paid": records the transfer,
 * sends the acknowledgement email, and reports per-address delivery.
 *
 * Amount defaults to the configured entry fee but stays editable — cash and
 * round-number UPI transfers are routinely confirmed for the fee on the day,
 * while a team that underpaid should have the real figure recorded instead.
 */
export function RowMarkPaid({
  team,
  defaultAmount,
}: {
  team: { id: string; code: string; name: string };
  defaultAmount: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(defaultAmount);
  const [ref, setRef] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function markPaid() {
    setBusy(true);
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
        setError(data.error ?? "That did not go through.");
        return;
      }
      if (data.sent > 0) {
        toast.success(`Payment verified · ${team.code}`, {
          description: `All member ticket PDFs generated & emailed to team leader.`,
        });
      } else {
        toast.warning(`Payment verified · ${team.code}`, {
          description: `Tickets generated, but email delivery had issues: ${data.reason || "check address"}.`,
        });
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" aria-label={`Verify payment for ${team.name}`}>
          <BadgeIndianRupee className="size-4" />
          Verify payment
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            Verify payment for {team.name}?
          </DialogTitle>
          <DialogDescription>
            Confirming payment verifies the team, confirms registration, generates
            individual PDF admission tickets with unique QR codes for all members, and
            emails them as attachments to the team leader.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
          <div className="space-y-1.5">
            <Label htmlFor={`row-pay-amount-${team.id}`} className="text-xs text-muted-foreground">
              Amount (₹)
            </Label>
            <Input
              id={`row-pay-amount-${team.id}`}
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={busy}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`row-pay-ref-${team.id}`} className="text-xs text-muted-foreground">
              UPI / bank reference
            </Label>
            <Input
              id={`row-pay-ref-${team.id}`}
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder="UPI ref, cheque no., or cash"
              disabled={busy}
            />
          </div>
        </div>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={markPaid} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <BadgeIndianRupee className="size-4" />}
            Confirm payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
