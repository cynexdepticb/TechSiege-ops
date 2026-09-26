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
import { SHIFT_LABEL, STATION_LABEL } from "@/lib/authz-lite";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { PanelKind, VolunteerShift, Station } from "@/generated/prisma/enums";

export type MemberDraft = {
  id: string;
  kind: PanelKind;
  name: string;
  email: string;
  org: string;
  title: string;
  phone: string;
  bio: string;
  confirmed: boolean;
  active: boolean;
};

export type VolunteerDraft = {
  id: string;
  name: string;
  email: string;
  phone: string;
  shift: VolunteerShift;
  station: Station;
};

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    const first = data.fields ? Object.values(data.fields)[0] : null;
    throw new Error(String(first ?? data.error ?? "Could not save."));
  }
  return data;
}

/* ──────────────────────────── panel members ──────────────────────────── */

/** Adds a judge or mentor to the roster. Their portal login is created
 *  separately from /admin/settings, matched on this email address. */
export function PanelMemberEditor({ member }: { member?: MemberDraft }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(
    member ?? {
      kind: PanelKind.JUDGE as PanelKind,
      name: "",
      email: "",
      org: "",
      title: "",
      phone: "",
      bio: "",
      confirmed: false,
      active: true,
    },
  );

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    setBusy(true);
    try {
      await post("/api/admin/panel", { ...form, ...(member ? { id: member.id } : {}) });
      toast.success(member ? "Panel member updated" : `${form.name} added to the panel`);
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  const valid = form.name.trim().length >= 2 && form.email.includes("@");

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {member ? (
          <Button variant="ghost" size="sm" aria-label={`Edit ${member.name}`}>
            <Pencil className="size-4" />
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="size-4" /> Add panel member
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{member ? `Edit ${member.name}` : "Add panel member"}</DialogTitle>
          <DialogDescription>
            Give the email they will sign in with. Creating their login from Settings links the two
            automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pm-kind">Role</Label>
              <Select value={form.kind} onValueChange={(v) => set("kind", v as PanelKind)}>
                <SelectTrigger id="pm-kind">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PanelKind.JUDGE}>Judge — scores teams</SelectItem>
                  <SelectItem value={PanelKind.MENTOR}>Mentor — checkpoint feedback</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pm-name">Name</Label>
              <Input
                id="pm-name"
                value={form.name}
                onChange={(e) => set("name", e.target.value)}
                placeholder="Dr. Kavya Rao"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pm-email">Email</Label>
            <Input
              id="pm-email"
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
              placeholder="kavya.rao@panel.example"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pm-org">Organisation</Label>
              <Input
                id="pm-org"
                value={form.org}
                onChange={(e) => set("org", e.target.value)}
                placeholder="BITS Pilani"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pm-title">Title</Label>
              <Input
                id="pm-title"
                value={form.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder="Assistant Professor, CSE"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pm-phone">Phone</Label>
            <Input
              id="pm-phone"
              value={form.phone}
              onChange={(e) => set("phone", e.target.value)}
              placeholder="+91 98765 43210"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pm-bio">Bio</Label>
            <Textarea
              id="pm-bio"
              rows={2}
              value={form.bio}
              onChange={(e) => set("bio", e.target.value)}
              placeholder="Shown on the public judges page."
            />
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="pm-confirmed"
                checked={form.confirmed}
                onCheckedChange={(c) => set("confirmed", c)}
              />
              <Label htmlFor="pm-confirmed" className="text-sm">
                Confirmed for event day
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="pm-active"
                checked={form.active}
                onCheckedChange={(c) => set("active", c)}
              />
              <Label htmlFor="pm-active" className="text-sm">
                On the panel
              </Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={busy || !valid}>
            {busy ? "Saving…" : member ? "Save changes" : "Add to panel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ────────────────────────────── volunteers ───────────────────────────── */

export function VolunteerEditor({ volunteer }: { volunteer?: VolunteerDraft }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(
    volunteer ?? {
      name: "",
      email: "",
      phone: "",
      shift: VolunteerShift.MORNING as VolunteerShift,
      station: Station.REGISTRATION_DESK as Station,
    },
  );

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    setBusy(true);
    try {
      await post("/api/admin/panel", {
        entity: "volunteer",
        ...form,
        ...(volunteer ? { id: volunteer.id } : {}),
      });
      toast.success(volunteer ? "Shift updated" : `${form.name} added to the roster`);
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  }

  const valid = form.name.trim().length >= 2;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {volunteer ? (
          <Button variant="ghost" size="sm" aria-label={`Edit ${volunteer.name}`}>
            <Pencil className="size-3.5" />
          </Button>
        ) : (
          <Button size="sm">
            <Plus className="size-4" /> Add volunteer
          </Button>
        )}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{volunteer ? `Edit ${volunteer.name}` : "Add volunteer"}</DialogTitle>
          <DialogDescription>
            A roster entry sets the shift and station. Give them a check-in login from Settings if
            they will scan at the door.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="vl-name">Name</Label>
            <Input
              id="vl-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="vl-station">Station</Label>
              <Select value={form.station} onValueChange={(v) => set("station", v as Station)}>
                <SelectTrigger id="vl-station">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(Station).map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATION_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vl-shift">Shift</Label>
              <Select value={form.shift} onValueChange={(v) => set("shift", v as VolunteerShift)}>
                <SelectTrigger id="vl-shift">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(VolunteerShift).map((s) => (
                    <SelectItem key={s} value={s}>
                      {SHIFT_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="vl-email">Email</Label>
              <Input
                id="vl-email"
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="vl-phone">Phone</Label>
              <Input
                id="vl-phone"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={busy || !valid}>
            {busy ? "Saving…" : volunteer ? "Save changes" : "Add volunteer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
