"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COMM_TYPE_LABEL, TEAM_STATUS_LABEL } from "@/lib/authz-lite";

import { Send } from "lucide-react";
import { toast } from "sonner";
import { CommType, TeamStatus } from "@/generated/prisma/enums";

type Template = { key: string; name: string; type: CommType; subject: string };

/**
 * Composes a bulk send. Shows the audience size for the chosen filters before
 * anything is sent, because an unfiltered send reaches every team.
 */
export function CampaignComposer({
  templates,
  tracks,
}: {
  templates: Template[];
  tracks: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [templateKey, setTemplateKey] = useState(templates[0]?.key ?? "");
  const [trackId, setTrackId] = useState("all");
  const [status, setStatus] = useState("all");
  const [limit, setLimit] = useState(50);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const template = templates.find((t) => t.key === templateKey);
  const type: CommType = template?.type ?? CommType.CUSTOM;

  const activeFilters = [trackId !== "all", status !== "all"].filter(Boolean).length;

  async function send() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/comms/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateKey,
          type,
          ...(trackId !== "all" ? { trackId } : {}),
          ...(status !== "all" ? { status } : {}),
          limit,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Send failed.");
      toast.success(
        `Sent to ${data.sent} ${data.sent === 1 ? "team" : "teams"}${
          data.failed ? ` · ${data.failed} failed` : ""
        }`,
      );
      setConfirming(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Send failed.");
    } finally {
      setBusy(false);
    }
  }

  if (templates.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Send a campaign</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No active templates. Create one first.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Send className="size-4" /> Send a campaign
        </CardTitle>
        <CardDescription>
          Sends go out one at a time to avoid provider rate limits.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="c-template">Template</Label>
          <Select value={templateKey} onValueChange={setTemplateKey}>
            <SelectTrigger id="c-template">
              <SelectValue placeholder="Choose a template" />
            </SelectTrigger>
            <SelectContent>
              {templates.map((t) => (
                <SelectItem key={t.key} value={t.key}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {template ? (
            <p className="text-xs text-muted-foreground">
              {COMM_TYPE_LABEL[template.type]} · “{template.subject}”
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="c-track">Track</Label>
          <Select value={trackId} onValueChange={setTrackId}>
            <SelectTrigger id="c-track">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All tracks</SelectItem>
              {tracks.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="c-status">Team status</Label>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger id="c-status">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {Object.values(TeamStatus)
                .filter((s) => s !== TeamStatus.DISQUALIFIED)
                .map((s) => (
                  <SelectItem key={s} value={s}>
                    {TEAM_STATUS_LABEL[s]}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="c-limit">Maximum recipients</Label>
          <Input
            id="c-limit"
            type="number"
            min={1}
            max={500}
            value={limit}
            onChange={(e) => setLimit(Math.min(500, Math.max(1, Number(e.target.value) || 1)))}
          />
          <p className="text-xs text-muted-foreground">
            Capped at 500 per send.
          </p>
        </div>

        {confirming ? (
          <div className="space-y-3 rounded-lg border border-warning/40 bg-warning/10 p-3">
            <p className="text-sm">
              {activeFilters === 0
                ? `This emails every team with no filter, up to ${limit}.`
                : `This emails up to ${limit} ${activeFilters === 1 ? "team" : "teams"} matching the filters.`}{" "}
              Are you sure?
            </p>
            <div className="flex gap-2">
              <Button size="sm" onClick={send} disabled={busy}>
                {busy ? "Sending…" : "Yes, send it"}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <Button size="sm" className="w-full" onClick={() => setConfirming(true)}>
            <Send className="size-4" /> Review and send
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
