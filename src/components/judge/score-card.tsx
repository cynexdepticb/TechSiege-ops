"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CRITERIA, SCORE_MAX, SCORE_MIN, type CriterionKey } from "@/lib/site";
import { toast } from "sonner";
import { Save } from "lucide-react";

export type ExistingScore = {
  id: string;
  total: number;
  comments: string;
  values: Record<CriterionKey, number>;
};

/**
 * Rubric entry for one team. The weighted total is computed here so the judge
 * sees the consequence of their numbers before saving, and the same weights are
 * applied server-side on submit — the client is only a preview, never the
 * authority.
 *
 * An existing score is loaded into the form rather than shown as a summary, so
 * a judge returning to a team edits their own numbers instead of starting from
 * blanks and wondering what they had entered before.
 */
export function ScoreCard({
  teamId,
  teamName,
  existing,
}: {
  teamId: string;
  teamName: string;
  existing: ExistingScore | null;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Record<string, number | null>>(() =>
    Object.fromEntries(
      CRITERIA.map((c) => [c.key, existing ? existing.values[c.key] : null]),
    ) as Record<CriterionKey, number | null>,
  );
  const [comments, setComments] = useState(existing?.comments ?? "");
  const [busy, setBusy] = useState(false);

  const total = useMemo(
    () =>
      CRITERIA.reduce((sum, c) => {
        const v = values[c.key];
        return v === null ? sum : sum + v * c.weight;
      }, 0),
    [values],
  );

  const filled = CRITERIA.filter((c) => values[c.key] !== null).length;
  const complete = filled === CRITERIA.length;

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/judge/scores", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId, comments, ...values }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        const first = data.fields ? Object.values(data.fields)[0] : null;
        throw new Error(String(first ?? data.error ?? "Could not save the score."));
      }
      toast.success(`Scored ${teamName}`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the score.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-lg border p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {CRITERIA.map((c) => (
          <div key={c.key} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-2">
              <Label htmlFor={`${teamId}-${c.key}`} className="text-xs">
                {c.label}
              </Label>
              <span className="text-[11px] text-muted-foreground">
                {Math.round(c.weight * 100)}%
              </span>
            </div>
            <input
              id={`${teamId}-${c.key}`}
              type="range"
              min={SCORE_MIN}
              max={SCORE_MAX}
              step={1}
              value={values[c.key] ?? SCORE_MIN}
              onChange={(e) =>
                setValues((v) => ({ ...v, [c.key]: Number(e.target.value) }))
              }
              className="w-full accent-primary"
            />
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span className="truncate" title={c.hint}>
                {c.hint}
              </span>
              <span className="font-mono tabular-nums">
                {values[c.key] ?? "–"}
                {(values[c.key] ?? 0) * c.weight !== 0 || values[c.key] === 0
                  ? ` · ${((values[c.key] ?? 0) * c.weight).toFixed(2)}`
                  : ""}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${teamId}-comments`} className="text-xs">
          Comments
        </Label>
        <Textarea
          id={`${teamId}-comments`}
          rows={3}
          value={comments}
          onChange={(e) => setComments(e.target.value)}
          placeholder="What stood out? What would you push them on?"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm">
          {complete ? (
            <span className="font-mono font-medium tabular-nums">
              Weighted total {total.toFixed(2)} / {SCORE_MAX}
            </span>
          ) : (
            <span className="text-muted-foreground">
              {filled} of {CRITERIA.length} criteria scored
            </span>
          )}
        </div>
        <Button size="sm" onClick={save} disabled={busy || !complete}>
          <Save className="size-4" />
          {busy ? "Saving…" : existing ? "Update score" : "Submit score"}
        </Button>
      </div>
    </div>
  );
}
