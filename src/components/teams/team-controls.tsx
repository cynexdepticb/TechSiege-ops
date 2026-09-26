"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TEAM_STATUS_LABEL } from "@/lib/authz-lite";
import { TeamStatus } from "@/generated/prisma/enums";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

/**
 * Status and track overrides for a single team. Both go through
 * /api/admin/teams, which audits every change.
 */
export function TeamControls({
  team,
  tracks,
}: {
  team: { id: string; status: TeamStatus; trackId: string; disqualifiedReason: string };
  tracks: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [status, setStatus] = useState<TeamStatus>(team.status);
  const [trackId, setTrackId] = useState(team.trackId);
  const [reason, setReason] = useState(team.disqualifiedReason);
  const [busy, setBusy] = useState<"status" | "track" | null>(null);

  async function patch(body: Record<string, unknown>, kind: "status" | "track") {
    setBusy(kind);
    try {
      const res = await fetch("/api/admin/teams", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ teamId: team.id, ...body }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Update failed.");
      toast.success(kind === "status" ? "Status updated" : "Track updated");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed.");
    } finally {
      setBusy(null);
    }
  }

  const needsReason = status === TeamStatus.DISQUALIFIED;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Manage</CardTitle>
        <CardDescription>Changes are recorded in the audit log.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="team-status">Status</Label>
          <div className="flex gap-2">
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as TeamStatus)}
            >
              <SelectTrigger id="team-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.values(TeamStatus).map((s) => (
                  <SelectItem key={s} value={s}>
                    {TEAM_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="shrink-0"
              disabled={busy !== null || status === team.status}
              onClick={() => patch({ status, reason }, "status")}
            >
              {busy === "status" ? <Loader2 className="size-4 animate-spin" /> : "Save"}
            </Button>
          </div>
          {needsReason ? (
            <div className="space-y-1.5">
              <Label htmlFor="dq-reason">Reason</Label>
              <Textarea
                id="dq-reason"
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is this team being disqualified?"
              />
            </div>
          ) : null}
        </div>

        <div className="space-y-2">
          <Label htmlFor="team-track">Track</Label>
          <div className="flex gap-2">
            <Select value={trackId} onValueChange={setTrackId}>
              <SelectTrigger id="team-track">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tracks.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="sm"
              className="shrink-0"
              disabled={busy !== null || trackId === team.trackId}
              onClick={() => patch({ trackId }, "track")}
            >
              {busy === "track" ? <Loader2 className="size-4 animate-spin" /> : "Save"}
            </Button>
          </div>
          {trackId !== team.trackId ? (
            <p className="text-xs text-muted-foreground">
              Moving a team between tracks affects judging assignments and analytics.
            </p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
