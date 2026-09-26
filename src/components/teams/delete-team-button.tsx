"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Loader2, Trash2 } from "lucide-react";

/**
 * Permanent team deletion.
 *
 * The button stays disabled until the team code is typed exactly, because this
 * is the one action in the app with no undo — the audit log keeps a record, but
 * the team, its members and its emails are gone. A team carrying scores, a
 * submission or check-in logs is refused by the API regardless, since deleting
 * it would destroy judged results; the error is surfaced here verbatim so the
 * reason is never a guess.
 */
export function DeleteTeamButton({
  team,
  blockers,
}: {
  team: { id: string; code: string; name: string };
  /** Pre-computed history that makes the team undeletable, if any. */
  blockers: string[];
}) {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState<string | null>(null);
  /**
   * Set after the API refuses with 409. The server is the authority on what
   * blocks a delete, and its list can be longer than the one this page rendered
   * (a score recorded since the page loaded, say). Without this the card would
   * show the refusal and then be unable to act on it.
   */
  const [override, setOverride] = useState(false);

  const blocked = blockers.length > 0;
  const armed = confirm.trim().toUpperCase() === team.code.toUpperCase();
  /** True when deleting destroys history, whether we knew it up front or not. */
  const destructive = blocked || override;

  async function remove() {
    setBusy(true);
    setReason(null);
    try {
      const res = await fetch(`/api/admin/teams/${team.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ force: destructive }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        if (res.status === 409) setOverride(true);
        setReason(data.error ?? "Delete failed.");
        return;
      }
      toast.success(`${data.code} deleted`, {
        description: data.forced
          ? "Its scores and check-in history were destroyed too. The audit log records this."
          : "The audit log keeps a record of it.",
      });
      router.push("/admin/teams");
      router.refresh();
    } catch {
      setReason("Could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive">Delete team</CardTitle>
        <CardDescription>
          Removes {team.name} and its members, emails and panel assignments. This
          cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
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
            If you only want it out of the running, set the status to{" "}
            <span className="font-medium">Disqualified</span> instead.
          </p>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="delete-confirm" className="text-xs text-muted-foreground">
            Type <span className="font-mono font-medium text-foreground">{team.code}</span> to confirm
          </Label>
          <div className="flex gap-2">
            <Input
              id="delete-confirm"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={team.code}
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
            />
            <Button
              variant="destructive"
              className="shrink-0"
              disabled={!armed || busy}
              onClick={remove}
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              {destructive ? "Delete anyway" : "Delete"}
            </Button>
          </div>
        </div>

        {reason ? (
          <p role="alert" className="text-sm text-destructive">
            {reason}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
