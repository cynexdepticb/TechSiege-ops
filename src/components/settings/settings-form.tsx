"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/primitives";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { Save } from "lucide-react";

type Settings = {
  eventName: string;
  submissionDeadline: string;
  registrationOpen: boolean;
  maxTeams: number;
};

/** Each field saves independently so a bad value can't block the rest. */
export function SettingsForm({ settings, canEdit }: { settings: Settings; canEdit: boolean }) {
  const router = useRouter();
  const [form, setForm] = useState(settings);
  const [busy, setBusy] = useState<string | null>(null);

  const save = async (key: string, value: string) => {
    setBusy(key);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "setting", key, value }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not save.");
      toast.success("Setting saved");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(null);
    }
  };

  const field = (
    label: string,
    key: string,
    hint: string,
    control: React.ReactNode,
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={`s-${key}`}>{label}</Label>
      {control}
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>Event configuration</CardTitle>
        <CardDescription>Read live by the registration form and event-day tools.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {field(
          "Event name",
          "event_name",
          "Shown on the public registration page and in every email.",
          <div className="flex gap-2">
            <Input
              id="s-event_name"
              value={form.eventName}
              disabled={!canEdit}
              onChange={(e) => setForm((f) => ({ ...f, eventName: e.target.value }))}
            />
            <Button
              size="sm"
              className="shrink-0"
              disabled={!canEdit || busy !== null || form.eventName === settings.eventName}
              onClick={() => save("event_name", form.eventName)}
            >
              <Save className="size-4" />
            </Button>
          </div>,
        )}

        {field(
          "Submission deadline",
          "submission_deadline",
          "Once this passes, submissions lock themselves and volunteers can no longer log the final checkpoint.",
          <div className="flex gap-2">
            <Input
              id="s-submission_deadline"
              type="datetime-local"
              value={form.submissionDeadline.slice(0, 16)}
              disabled={!canEdit}
              onChange={(e) =>
                setForm((f) => ({ ...f, submissionDeadline: e.target.value }))
              }
            />
            <Button
              size="sm"
              className="shrink-0"
              disabled={
                !canEdit ||
                busy !== null ||
                form.submissionDeadline === settings.submissionDeadline
              }
              onClick={() => save("submission_deadline", form.submissionDeadline)}
            >
              <Save className="size-4" />
            </Button>
          </div>,
        )}

        {field(
          "Registration open",
          "registration_open",
          "Turn off to close the public form without taking it down.",
          <div className="flex items-center justify-between gap-2">
            <Switch
              id="s-registration_open"
              checked={form.registrationOpen}
              disabled={!canEdit}
              onCheckedChange={(checked) => {
                setForm((f) => ({ ...f, registrationOpen: checked }));
                void save("registration_open", String(checked));
              }}
            />
            <Button
              size="sm"
              variant="ghost"
              disabled={!canEdit || busy !== null}
              onClick={() => save("registration_open", String(form.registrationOpen))}
            >
              Save
            </Button>
          </div>,
        )}

        {field(
          "Team cap",
          "max_teams",
          "Registration blocks once this many non-disqualified teams exist.",
          <div className="flex gap-2">
            <Input
              id="s-max_teams"
              type="number"
              min={1}
              value={form.maxTeams}
              disabled={!canEdit}
              onChange={(e) =>
                setForm((f) => ({ ...f, maxTeams: Number(e.target.value) || 1 }))
              }
            />
            <Button
              size="sm"
              className="shrink-0"
              disabled={!canEdit || busy !== null || form.maxTeams === settings.maxTeams}
              onClick={() => save("max_teams", String(form.maxTeams))}
            >
              <Save className="size-4" />
            </Button>
          </div>,
        )}
      </CardContent>
    </Card>
  );
}
