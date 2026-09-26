"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/primitives";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { ROLE_LABEL, VERTICAL_LABEL } from "@/lib/authz-lite";
import { relativeTime } from "@/lib/utils";
import { toast } from "sonner";
import { Link2, TriangleAlert, UserPlus } from "lucide-react";
import { PanelKind, Role, Vertical } from "@/generated/prisma/enums";

type Staff = {
  id: string;
  name: string;
  email: string;
  role: Role;
  vertical: Vertical | null;
  active: boolean;
  lastLoginAt: string | null;
  linkedPanelName: string | null;
  linkedVolunteerName: string | null;
};

type PanelOption = { id: string; kind: PanelKind; name: string; email: string; taken: boolean };
type VolunteerOption = { id: string; name: string; taken: boolean };

const isPanel = (role: Role) => role === Role.JUDGE || role === Role.MENTOR;

export function StaffManager({
  staff,
  panelMembers,
  volunteers,
  selfId,
}: {
  staff: Staff[];
  panelMembers: PanelOption[];
  volunteers: VolunteerOption[];
  selfId: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function update(id: string, patch: Record<string, unknown>) {
    setBusy(id);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-staff", userId: id, ...patch }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Could not update the account.");
      toast.success("Account updated");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the account.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <CardTitle>Staff accounts</CardTitle>
            <CardDescription>
              {staff.length === 1
                ? "One account. Everyone else is created here."
                : `${staff.length} accounts. Deactivating one signs them out on their next request.`}
            </CardDescription>
          </div>
          <NewStaff panelMembers={panelMembers} volunteers={volunteers} />
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <ul className="divide-y">
          {staff.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate font-medium">{s.name}</span>
                  {s.id === selfId ? <Badge variant="outline">You</Badge> : null}
                  {!s.active ? <Badge variant="muted">Inactive</Badge> : null}
                  {isPanel(s.role) ? (
                    s.linkedPanelName ? (
                      <Badge variant="success">
                        <Link2 className="size-3" /> {s.linkedPanelName}
                      </Badge>
                    ) : (
                      <Badge variant="destructive">
                        <TriangleAlert className="size-3" /> No panel record
                      </Badge>
                    )
                  ) : null}
                  {s.role === Role.VOLUNTEER && s.linkedVolunteerName ? (
                    <Badge variant="success">
                      <Link2 className="size-3" /> {s.linkedVolunteerName}
                    </Badge>
                  ) : null}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {s.email}
                  {s.vertical ? ` · ${VERTICAL_LABEL[s.vertical]}` : ""}
                  {s.lastLoginAt ? ` · last seen ${relativeTime(s.lastLoginAt)}` : " · never signed in"}
                </div>
              </div>

              <Select
                value={s.role}
                onValueChange={(v) => void update(s.id, { role: v })}
                disabled={busy === s.id}
              >
                <SelectTrigger className="w-36" aria-label={`Role for ${s.name}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(Role).map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {s.role === Role.TEAM_LEAD ? (
                <Select
                  value={s.vertical ?? "none"}
                  onValueChange={(v) => void update(s.id, { vertical: v === "none" ? null : v })}
                  disabled={busy === s.id}
                >
                  <SelectTrigger className="w-48" aria-label={`Vertical for ${s.name}`}>
                    <SelectValue placeholder="Pick a vertical" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No vertical</SelectItem>
                    {Object.values(Vertical).map((v) => (
                      <SelectItem key={v} value={v}>
                        {VERTICAL_LABEL[v]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : null}

              <div className="flex items-center gap-2">
                <Label htmlFor={`active-${s.id}`} className="text-xs text-muted-foreground">
                  Active
                </Label>
                <Switch
                  id={`active-${s.id}`}
                  checked={s.active}
                  disabled={busy === s.id}
                  onCheckedChange={(checked) => void update(s.id, { active: checked })}
                />
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function NewStaff({
  panelMembers,
  volunteers,
}: {
  panelMembers: PanelOption[];
  volunteers: VolunteerOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: Role.TEAM_LEAD as Role,
    vertical: "" as Vertical | "",
    panelMemberId: "" as string,
    volunteerId: "" as string,
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const panelOptions = panelMembers.filter(
    (p) => p.kind === form.role && (!p.taken || p.email.toLowerCase() === form.email.toLowerCase()),
  );
  const volunteerOptions = volunteers.filter((v) => !v.taken);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "create-staff",
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          vertical: form.role === Role.TEAM_LEAD ? form.vertical || null : null,
          // Left null when blank so the server falls back to matching by email.
          panelMemberId: isPanel(form.role) ? form.panelMemberId || null : null,
          volunteerId: form.role === Role.VOLUNTEER ? form.volunteerId || null : null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        const first = data.fields ? Object.values(data.fields)[0] : null;
        throw new Error(String(first ?? data.error ?? "Could not create the account."));
      }
      toast.success(`${data.user.email} can now sign in`);
      setOpen(false);
      setForm({
        name: "",
        email: "",
        password: "",
        role: Role.TEAM_LEAD,
        vertical: "",
        panelMemberId: "",
        volunteerId: "",
      });
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create the account.");
    } finally {
      setBusy(false);
    }
  }

  const valid =
    form.name.trim().length >= 2 &&
    form.email.includes("@") &&
    form.password.length >= 10 &&
    (form.role !== Role.TEAM_LEAD || Boolean(form.vertical));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <UserPlus className="size-4" /> Add account
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a staff account</DialogTitle>
          <DialogDescription>
            Team leads are scoped to one vertical. Volunteers only get the check-in scanner.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="n-name">Name</Label>
            <Input
              id="n-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="n-email">Email</Label>
            <Input
              id="n-email"
              type="email"
              value={form.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="n-password">Temporary password</Label>
            <Input
              id="n-password"
              type="text"
              value={form.password}
              onChange={(e) => set("password", e.target.value)}
              placeholder="At least 10 characters"
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="n-role">Role</Label>
              <Select value={form.role} onValueChange={(v) => set("role", v as Role)}>
                <SelectTrigger id="n-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(Role).map((r) => (
                    <SelectItem key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {form.role === Role.TEAM_LEAD ? (
              <div className="space-y-1.5">
                <Label htmlFor="n-vertical">Vertical</Label>
                <Select
                  value={form.vertical || "none"}
                  onValueChange={(v) => set("vertical", v === "none" ? "" : (v as Vertical))}
                >
                  <SelectTrigger id="n-vertical">
                    <SelectValue placeholder="Pick one" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none" disabled>
                      Pick a vertical
                    </SelectItem>
                    {Object.values(Vertical).map((v) => (
                      <SelectItem key={v} value={v}>
                        {VERTICAL_LABEL[v]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}
          </div>

          {isPanel(form.role) ? (
            <div className="space-y-1.5 rounded-lg border border-warning/40 bg-warning/10 p-3">
              <Label htmlFor="n-panel">
                {form.role === Role.JUDGE ? "Judge" : "Mentor"} record
              </Label>
              <Select
                value={form.panelMemberId || "auto"}
                onValueChange={(v) => set("panelMemberId", v === "auto" ? "" : v)}
              >
                <SelectTrigger id="n-panel">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Match by email address</SelectItem>
                  {panelOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name} — {p.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {panelOptions.length === 0
                  ? `No ${form.role === Role.JUDGE ? "judge" : "mentor"} on the roster yet. Add one at /admin/panel first, using this same email.`
                  : "Their portal only shows the teams assigned to them on /admin/panel."}
              </p>
            </div>
          ) : null}

          {form.role === Role.VOLUNTEER && volunteerOptions.length > 0 ? (
            <div className="space-y-1.5">
              <Label htmlFor="n-volunteer">Roster entry (optional)</Label>
              <Select
                value={form.volunteerId || "none"}
                onValueChange={(v) => set("volunteerId", v === "none" ? "" : v)}
              >
                <SelectTrigger id="n-volunteer">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Not on the roster</SelectItem>
                  {volunteerOptions.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Links the login to a shift and station. The scanner works either way.
              </p>
            </div>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={busy || !valid}>
            {busy ? "Creating…" : "Create account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
