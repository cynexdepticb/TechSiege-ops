"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/primitives";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { COMM_TYPE_LABEL } from "@/lib/authz-lite";
import { TEMPLATE_VARIABLES } from "@/lib/email/templates";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { CommType } from "@/generated/prisma/enums";

const blank = {
  key: "",
  name: "",
  type: CommType.CUSTOM as CommType,
  subject: "",
  body: "",
  active: true,
};

/**
 * Creates a template. The key is fixed at creation and immutable afterwards —
 * campaigns address templates by key, so renaming one would break every
 * scheduled send that references it.
 */
export function NewTemplate() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(blank);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/templates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        const first = data.fields ? Object.values(data.fields)[0] : null;
        throw new Error(String(first ?? data.error ?? "Could not create the template."));
      }
      toast.success(`${data.template.name} created`);
      setOpen(false);
      setForm(blank);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the template.");
    } finally {
      setBusy(false);
    }
  }

  const valid =
    form.key.trim().length >= 2 &&
    form.name.trim().length >= 2 &&
    form.subject.trim().length >= 3 &&
    form.body.trim().length >= 10;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" /> New template
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New email template</DialogTitle>
          <DialogDescription>
            The key is how campaigns address this template. Pick it once — it cannot be renamed
            later without breaking scheduled sends.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="tp-key">Key</Label>
              <Input
                id="tp-key"
                value={form.key}
                onChange={(e) => set("key", e.target.value.toLowerCase().replace(/\s+/g, "_"))}
                placeholder="final_call"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tp-type">Campaign type</Label>
              <Select value={form.type} onValueChange={(v) => set("type", v as CommType)}>
                <SelectTrigger id="tp-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(CommType).map((t) => (
                    <SelectItem key={t} value={t}>
                      {COMM_TYPE_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tp-name">Name</Label>
            <Input
              id="tp-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Final call for submissions"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tp-subject">Subject</Label>
            <Input
              id="tp-subject"
              value={form.subject}
              onChange={(e) => set("subject", e.target.value)}
              placeholder="AGENTX 2026 — submissions close {{deadline}}"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="tp-body">Body</Label>
            <Textarea
              id="tp-body"
              rows={8}
              value={form.body}
              onChange={(e) => set("body", e.target.value)}
              placeholder={"Hi {{lead_name}},\n\n…"}
            />
            <div className="flex flex-wrap gap-1.5 pt-1">
              {TEMPLATE_VARIABLES.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  onClick={() => set("body", `${form.body}{{${v.key}}}`)}
                  title={v.label}
                  className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs text-muted-foreground hover:bg-muted/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {`{{${v.key}}}`}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Switch
              id="tp-active"
              checked={form.active}
              onCheckedChange={(c) => set("active", c)}
            />
            <Label htmlFor="tp-active" className="text-sm">
              Active
            </Label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={busy || !valid}>
            {busy ? "Creating…" : "Create template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
