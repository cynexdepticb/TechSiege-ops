"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { SCREENING_LABEL } from "@/lib/labels";
import { ScreeningStatus } from "@/generated/prisma/enums";
import { toast } from "sonner";
import { Loader2, Scale } from "lucide-react";

/**
 * Records a screening decision. Routed through /api/admin/teams (action
 * "screen") so the decision is audited alongside team changes.
 */
export function ScreeningControls({
  submission,
}: {
  submission: { id: string; status: ScreeningStatus; notes: string };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<ScreeningStatus>(submission.status);
  const [notes, setNotes] = useState(submission.notes);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/teams", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "screen",
          submissionId: submission.id,
          decision,
          notes,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not save the decision.");
      toast.success("Screening decision saved");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the decision.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Scale className="size-4" />
          {submission.status === ScreeningStatus.PENDING ? "Screen" : "Edit"}
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Screening decision</DialogTitle>
          <DialogDescription>
            Advancing a team moves it into the judged round.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {[
              ScreeningStatus.ADVANCE,
              ScreeningStatus.NOT_ADVANCING,
              ScreeningStatus.PENDING,
            ].map((s) => (
              <Button
                key={s}
                type="button"
                size="sm"
                variant={decision === s ? "default" : "outline"}
                onClick={() => setDecision(s)}
              >
                {SCREENING_LABEL[s]}
              </Button>
            ))}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="screening-notes" className="text-sm font-medium">
              Notes
            </label>
            <Textarea
              id="screening-notes"
              rows={4}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything the panel should know — missing demo, broken build…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : "Save decision"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
