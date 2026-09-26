"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ListPlus, X } from "lucide-react";
import { toast } from "sonner";
import { PanelKind } from "@/generated/prisma/enums";

export type AssignableTeam = {
  id: string;
  code: string;
  name: string;
  trackName: string | null;
  status: string;
  assignedElsewhere: number;
};

export type AssignedTeam = { id: string; teamId: string; code: string; name: string };

/**
 * Binds teams to a judge or mentor.
 *
 * Nothing else in the app creates assignments, so without this a panel member
 * signs in to an empty portal and cannot score or advise anyone.
 */
export function AssignmentEditor({
  memberId,
  memberName,
  kind,
  assigned,
  teams,
}: {
  memberId: string;
  memberName: string;
  kind: PanelKind;
  assigned: AssignedTeam[];
  teams: AssignableTeam[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set(assigned.map((a) => a.teamId)));
  const [query, setQuery] = useState("");

  const held = new Set(assigned.map((a) => a.teamId));
  const visible = teams.filter((t) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return t.code.toLowerCase().includes(q) || t.name.toLowerCase().includes(q);
  });

  const toggle = (teamId: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });

  const changes = () => {
    const add = [...picked].filter((id) => !held.has(id));
    const remove = assigned.filter((a) => !picked.has(a.teamId));
    return { add, remove };
  };

  async function save() {
    const { add, remove } = changes();
    if (add.length === 0 && remove.length === 0) {
      setOpen(false);
      return;
    }

    setBusy(true);
    try {
      // Sequential rather than parallel: the same team can legitimately go to
      // several panel members, and firing a burst of writes at one table makes
      // the failure of any single one hard to attribute.
      for (const teamId of add) {
        const res = await fetch("/api/admin/assignments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ panelId: memberId, teamId }),
        });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not assign a team.");
      }
      for (const a of remove) {
        const res = await fetch(`/api/admin/assignments?id=${a.id}`, { method: "DELETE" });
        const data = await res.json();
        if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not unassign a team.");
      }

      const verb = kind === PanelKind.JUDGE ? "judging" : "mentoring";
      toast.success(
        `${memberName} now has ${picked.size} ${picked.size === 1 ? "team" : "teams"} for ${verb}`,
      );
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the assignments.");
    } finally {
      setBusy(false);
    }
  }

  const { add, remove } = changes();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <ListPlus className="size-4" /> Teams
          <Badge variant="muted" className="ml-1">
            {assigned.length}
          </Badge>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Teams for {memberName}</DialogTitle>
          <DialogDescription>
            {kind === PanelKind.JUDGE
              ? "Judges only see the teams listed here, and can only score those."
              : "Mentors only see the teams listed here, and can only leave feedback on those."}
          </DialogDescription>
        </DialogHeader>

        {teams.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
            No teams have registered yet. Assignments can be made once teams are in.
          </p>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label htmlFor={`as-q-${memberId}`}>Filter</Label>
              <Input
                id={`as-q-${memberId}`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Team code or name"
              />
            </div>

            <ul className="max-h-72 space-y-1 overflow-y-auto rounded-lg border p-1">
              {visible.length === 0 ? (
                <li className="p-3 text-sm text-muted-foreground">No team matches that.</li>
              ) : (
                visible.map((t) => {
                  const id = `as-${memberId}-${t.id}`;
                  const alreadyElsewhere = t.assignedElsewhere > 0 && !held.has(t.id);
                  return (
                    <li key={t.id}>
                      <label
                        htmlFor={id}
                        className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-muted"
                      >
                        <Checkbox
                          id={id}
                          checked={picked.has(t.id)}
                          onCheckedChange={() => toggle(t.id)}
                        />
                        <span className="font-mono text-xs text-muted-foreground">{t.code}</span>
                        <span className="min-w-0 flex-1 truncate text-sm">{t.name}</span>
                        {t.trackName ? (
                          <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
                            {t.trackName}
                          </span>
                        ) : null}
                        {alreadyElsewhere ? (
                          <Badge variant="muted" className="shrink-0">
                            +{t.assignedElsewhere}
                          </Badge>
                        ) : null}
                        {t.status === "DISQUALIFIED" ? (
                          <Badge variant="destructive" className="shrink-0">
                            DQ
                          </Badge>
                        ) : null}
                      </label>
                    </li>
                  );
                })
              )}
            </ul>
          </>
        )}

        <DialogFooter>
          <span className="mr-auto self-center text-xs text-muted-foreground">
            {add.length || remove.length
              ? `+${add.length} / −${remove.length}`
              : "No changes yet"}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save assignments"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Removes one assignment inline, from the roster card. */
export function UnassignButton({ assignmentId, teamCode }: { assignmentId: string; teamCode: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/assignments?id=${assignmentId}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not unassign.");
      toast.success(`${teamCode} unassigned`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not unassign.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={remove}
      disabled={busy}
      aria-label={`Unassign ${teamCode}`}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-mono text-xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
    >
      {teamCode}
      <X className="size-3" />
    </button>
  );
}
