"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { toast } from "sonner";
import { Save } from "lucide-react";

/** Checkpoint feedback a mentor leaves against one of their teams. */
export function MentorNotes({
  assignmentId,
  teamName,
  initial,
}: {
  assignmentId: string;
  teamName: string;
  initial: string;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(initial);
  const [busy, setBusy] = useState(false);
  const dirty = notes !== initial;

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/mentor/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assignmentId, notes }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not save your notes.");
      toast.success("Feedback saved");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save your notes.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <label
        htmlFor={`notes-${assignmentId}`}
        className="text-xs font-medium text-muted-foreground"
      >
        Your feedback for {teamName}
      </label>
      <Textarea
        id={`notes-${assignmentId}`}
        rows={3}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="What you saw at the checkpoint, what to try next…"
      />
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={save} disabled={busy || !dirty}>
          <Save className="size-4" />
          {busy ? "Saving…" : dirty ? "Save feedback" : "Saved"}
        </Button>
      </div>
    </div>
  );
}
