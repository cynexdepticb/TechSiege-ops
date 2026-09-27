"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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
import { Loader2, Ticket } from "lucide-react";

/**
 * Row-level "send ticket" for the teams table, for teams already marked paid
 * whose QR email has not gone out yet (the "no ticket sent" state). Same API
 * and semantics as the PaymentPanel's ticket button: the server refuses
 * unpaid teams, renders one QR per team, attaches it, and reports
 * per-address delivery.
 */
export function RowSendTicket({
  team,
}: {
  team: { id: string; code: string; name: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendTicket() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/teams/${team.id}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send-ticket" }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error ?? "That did not go through.");
        return;
      }
      const missed = (data.undelivered ?? []) as string[];
      if (missed.length > 0) {
        toast.warning(`${data.sent} of ${data.recipients} notified`, {
          description: `Ticket sent — not reached: ${missed.join(", ")}.`,
        });
      } else {
        toast.success(`Ticket sent · ${team.code}`, {
          description: `QR attached to ${data.recipients} email(s).`,
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
        <Button variant="outline" size="sm" aria-label={`Send ticket to ${team.name}`}>
          <Ticket className="size-4" />
          Send ticket
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send ticket to {team.name}?</DialogTitle>
          <DialogDescription>
            Emails the check-in QR to every member. Only possible because the
            entry fee is already confirmed — the server re-checks that before
            sending.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={sendTicket} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Ticket className="size-4" />}
            Send ticket & QR
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
