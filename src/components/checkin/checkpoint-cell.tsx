"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CheckpointName } from "@/generated/prisma/enums";
import { relativeTime } from "@/lib/utils";
import { toast } from "sonner";
import { Check, Loader2, Plus } from "lucide-react";

/**
 * One cell of the checkpoint board. Unlogged cells are tappable so a volunteer
 * can mark a team from a phone without leaving the board.
 */
export function CheckpointCell({
  teamId,
  teamCode,
  checkpoint,
  checkpointLabel,
  loggedAt,
  loggedBy,
}: {
  teamId: string;
  teamCode: string;
  checkpoint: CheckpointName;
  checkpointLabel: string;
  loggedAt: string | null;
  loggedBy: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [notedBy, setNotedBy] = useState("");
  const [busy, setBusy] = useState(false);

  async function log() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, checkpoint, note, notedBy }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not log the checkpoint.");
      toast.success(`${teamCode} · ${checkpointLabel} logged`);
      setOpen(false);
      setNote("");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not log the checkpoint.");
    } finally {
      setBusy(false);
    }
  }

  const done = Boolean(loggedAt);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={
            done
              ? `${checkpointLabel} logged ${relativeTime(loggedAt!)}${
                  loggedBy ? ` by ${loggedBy}` : ""
                }. Select to edit.`
              : `Log ${checkpointLabel} for ${teamCode}`
          }
          className={`inline-flex size-8 items-center justify-center rounded-md border transition-colors ${
            done
              ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
              : "border-dashed border-border text-muted-foreground hover:border-primary/60 hover:bg-accent hover:text-foreground"
          }`}
        >
          {done ? <Check className="size-4" /> : <Plus className="size-4" />}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {done ? "Edit checkpoint" : "Log checkpoint"}
          </DialogTitle>
          <DialogDescription>
            {teamCode} · {checkpointLabel}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor={`note-${teamId}-${checkpoint}`} className="text-sm font-medium">
              Note (optional)
            </label>
            <Input
              id={`note-${teamId}-${checkpoint}`}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Anything worth flagging"
            />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`by-${teamId}-${checkpoint}`} className="text-sm font-medium">
              Your name
            </label>
            <Input
              id={`by-${teamId}-${checkpoint}`}
              value={notedBy}
              onChange={(e) => setNotedBy(e.target.value)}
              placeholder={loggedBy ?? "Volunteer name"}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={log} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            {done ? "Update" : "Log"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
