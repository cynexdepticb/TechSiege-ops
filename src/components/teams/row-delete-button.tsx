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
import { Loader2, Trash2 } from "lucide-react";

/**
 * Row-level delete for the teams table.
 *
 * Kept behind a dialog that requires typing the team code, because a single
 * mistaken click in a dense table would otherwise destroy a registration with
 * no undo — the audit log keeps a record, but the team, its members and its
 * email history are gone. The API independently refuses any team carrying
 * scores, a submission or check-in logs, and that reason is shown verbatim.
 */
export function RowDeleteButton({
  team,
  memberCount,
  blockers,
}: {
  team: { id: string; code: string; name: string };
  /** Count of participants, shown so the blast radius is explicit. */
  memberCount: number;
  blockers: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  /**
   * Set after the API refuses with 409. The server is the authority on what
   * blocks a delete, and its list can be longer than the one this page rendered
   * (a score recorded since the page loaded, say). Without this the dialog would
   * show the refusal and then be unable to act on it.
   */
  const [override, setOverride] = useState(false);

  const blocked = blockers.length > 0;
  const armed = confirm.trim().toUpperCase() === team.code.toUpperCase();
  /** True when deleting destroys history, whether we knew it up front or not. */
  const destructive = blocked || override;

  function reset() {
    setConfirm("");
    setReason(null);
    setOverride(false);
  }

  async function remove() {
    setBusy(true);
    setReason(null);
    try {
      const res = await fetch(`/api/admin/teams/${team.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        // A team carrying history needs the override, otherwise the first click
        // would only ever return a 409 explaining why it is refusing.
        body: JSON.stringify({ force: destructive }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        // 409 is the API saying "this destroys something". Let the next click
        // through, so the dialog is never a dead end.
        if (res.status === 409) setOverride(true);
        setReason(data.error ?? "Delete failed.");
        return;
      }
      setOpen(false);
      toast.success(`${data.code} deleted`, {
        description: data.forced
          ? "Its scores and check-in history were destroyed too. The audit log records this."
          : "The audit log keeps a record of it.",
      });
      router.refresh();
    } catch {
      setReason("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Delete ${team.name}`}
          className="text-muted-foreground hover:text-destructive"
        >
          <Trash2 className="size-4" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete {team.name}?</DialogTitle>
          <DialogDescription>
            This permanently removes the team, its {memberCount}{" "}
            member{memberCount === 1 ? "" : "s"} and every email sent to them. It
            cannot be undone.
          </DialogDescription>
        </DialogHeader>

        {destructive ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {blockers.length > 0 ? (
              <>
                This team has {blockers.join(", ")}. Deleting it destroys that
                permanently.
              </>
            ) : (
              <>This team has records that would be destroyed permanently.</>
            )}{" "}
            If you only want it out of the running, cancel and set the status to
            Disqualified instead.
          </p>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor={`confirm-${team.id}`} className="text-xs text-muted-foreground">
            Type <span className="font-mono font-medium text-foreground">{team.code}</span> to confirm
          </Label>
          <Input
            id={`confirm-${team.id}`}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={team.code}
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
          />
        </div>

        {reason ? (
          <p role="alert" className="text-sm text-destructive">
            {reason}
          </p>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={remove} disabled={!armed || busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            {destructive ? "Delete anyway" : "Delete team"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
