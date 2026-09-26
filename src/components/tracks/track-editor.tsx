"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/primitives";
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
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";

export type TrackDraft = {
  id: string;
  name: string;
  description: string;
  requirementChecklist: string[];
  capacity: number | null;
  sortOrder: number;
  active: boolean;
  taken: number;
};

const blank = {
  name: "",
  description: "",
  checklist: "",
  capacity: "",
  sortOrder: "0",
  active: true,
};

/** Adds a track, or edits an existing one from its card. */
export function TrackEditor({ track }: { track?: TrackDraft }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(
    track
      ? {
          name: track.name,
          description: track.description,
          checklist: track.requirementChecklist.join("\n"),
          capacity: track.capacity === null ? "" : String(track.capacity),
          sortOrder: String(track.sortOrder),
          active: track.active,
        }
      : blank,
  );

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/tracks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(track ? { id: track.id } : {}),
          name: form.name,
          description: form.description,
          requirementChecklist: form.checklist
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
          capacity: form.capacity === "" ? null : Number(form.capacity),
          sortOrder: Number(form.sortOrder),
          active: form.active,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        const first = data.fields ? Object.values(data.fields)[0] : null;
        throw new Error(String(first ?? data.error ?? "Could not save the track."));
      }
      toast.success(track ? "Track updated" : `${data.track.name} added`);
      setOpen(false);
      if (!track) setForm(blank);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the track.");
    } finally {
      setBusy(false);
    }
  }

  const valid = form.name.trim().length >= 2 && form.description.trim().length >= 10;
  const belowFloor = track ? Number(form.capacity || 0) < track.taken : false;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {track ? (
          <Button variant="ghost" size="sm" aria-label={`Edit ${track.name}`}>
            <Pencil className="size-4" /> Edit
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="size-4" /> Add track
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{track ? `Edit ${track.name}` : "Add track"}</DialogTitle>
          <DialogDescription>
            Teams pick a track when they register, so the description is what applicants read
            before choosing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tr-name">Name</Label>
            <Input
              id="tr-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="AI for Education"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tr-desc">Description</Label>
            <Textarea
              id="tr-desc"
              rows={3}
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="What belongs in this track, and what does not."
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tr-check">What teams submit</Label>
            <Textarea
              id="tr-check"
              rows={4}
              value={form.checklist}
              onChange={(e) => set("checklist", e.target.value)}
              placeholder={"One requirement per line\n2–3 minute demo video"}
            />
            <p className="text-xs text-muted-foreground">One per line. Shown on the submission form.</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tr-cap">Capacity</Label>
              <Input
                id="tr-cap"
                type="number"
                min={0}
                value={form.capacity}
                onChange={(e) => set("capacity", e.target.value)}
                placeholder="Leave blank for no cap"
              />
              {track && track.taken > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {track.taken} {track.taken === 1 ? "team is" : "teams are"} already in this track.
                </p>
              ) : null}
              {belowFloor ? (
                <p className="text-xs text-destructive">
                  Cannot go below {track?.taken} — those teams are already allocated.
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tr-order">Sort order</Label>
              <Input
                id="tr-order"
                type="number"
                min={0}
                value={form.sortOrder}
                onChange={(e) => set("sortOrder", e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch id="tr-active" checked={form.active} onCheckedChange={(c) => set("active", c)} />
            <Label htmlFor="tr-active" className="text-sm">
              Open for registration
            </Label>
            {!form.active ? <Badge variant="muted">Hidden from the form</Badge> : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={busy || !valid || belowFloor}>
            {busy ? "Saving…" : track ? "Save changes" : "Add track"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
