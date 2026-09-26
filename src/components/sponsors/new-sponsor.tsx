"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { SPONSOR_STATUS_LABEL, SPONSOR_TIER_LABEL } from "@/lib/authz-lite";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { SponsorStatus, SponsorTier } from "@/generated/prisma/enums";

/** Adds a sponsor to the CRM. Edits happen from the row action. */
export function NewSponsor({ owners }: { owners: { id: string; name: string }[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    name: "",
    tier: SponsorTier.BRONZE as SponsorTier,
    status: SponsorStatus.LEAD as SponsorStatus,
    amount: "",
    contactPerson: "",
    contactEmail: "",
    notes: "",
    ownerId: owners[0]?.id ?? "",
  });

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/sponsors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          amount: form.amount === "" ? 0 : Number(form.amount),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        const first = data.fields ? Object.values(data.fields)[0] : null;
        throw new Error(String(first ?? data.error ?? "Could not save the sponsor."));
      }
      toast.success(`${data.sponsor.name} added`);
      setOpen(false);
      setForm((f) => ({ ...f, name: "", amount: "", contactPerson: "", contactEmail: "", notes: "" }));
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save the sponsor.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="w-full sm:w-auto">
          <Plus className="size-4" /> Add sponsor
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add sponsor</DialogTitle>
          <DialogDescription>
            Log a lead or a confirmed commitment. Amounts are in INR unless changed.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="sp-name">Organisation</Label>
            <Input
              id="sp-name"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="Acme Corp"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sp-tier">Tier</Label>
              <Select value={form.tier} onValueChange={(v) => set("tier", v as SponsorTier)}>
                <SelectTrigger id="sp-tier">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(SponsorTier).map((t) => (
                    <SelectItem key={t} value={t}>
                      {SPONSOR_TIER_LABEL[t]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sp-status">Status</Label>
              <Select
                value={form.status}
                onValueChange={(v) => set("status", v as SponsorStatus)}
              >
                <SelectTrigger id="sp-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.values(SponsorStatus).map((s) => (
                    <SelectItem key={s} value={s}>
                      {SPONSOR_STATUS_LABEL[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sp-amount">Amount (INR)</Label>
              <Input
                id="sp-amount"
                type="number"
                min={0}
                step={1000}
                value={form.amount}
                onChange={(e) => set("amount", e.target.value)}
                placeholder="50000"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sp-owner">Owner</Label>
              <Select value={form.ownerId} onValueChange={(v) => set("ownerId", v)}>
                <SelectTrigger id="sp-owner">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  {owners.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="sp-contact">Contact person</Label>
              <Input
                id="sp-contact"
                value={form.contactPerson}
                onChange={(e) => set("contactPerson", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sp-email">Contact email</Label>
              <Input
                id="sp-email"
                type="email"
                value={form.contactEmail}
                onChange={(e) => set("contactEmail", e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="sp-notes">Notes</Label>
            <Textarea
              id="sp-notes"
              rows={3}
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              placeholder="What did they ask for? What is blocking the invoice?"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={save} disabled={busy || !form.name.trim()}>
            {busy ? "Saving…" : "Add sponsor"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
