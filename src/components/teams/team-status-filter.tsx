"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TEAM_STATUS_LABEL } from "@/lib/authz-lite";
import { Search, X } from "lucide-react";
import { TeamStatus } from "@/generated/prisma/enums";

/**
 * Filter bar for the teams table. Submits as a GET form so filtering works
 * with JavaScript disabled and the URL stays shareable; the search box debounces
 * into the same query string.
 */
export function TeamStatusFilter({
  tracks,
  colleges,
  defaults,
}: {
  tracks: { id: string; name: string }[];
  colleges: string[];
  defaults: { q: string; status: string; trackId: string; college: string; paid: string };
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(defaults.q);

  /*
   * Re-sync the box when the URL changes underneath us — back/forward, the
   * Clear button, or a filter changed by another control. Adjusting during
   * render rather than in an effect keeps it to one render pass and avoids the
   * cascading re-render an effect would cause.
   */
  const [lastSyncedQ, setLastSyncedQ] = useState(defaults.q);
  if (defaults.q !== lastSyncedQ) {
    setLastSyncedQ(defaults.q);
    setQ(defaults.q);
  }

  // Debounce typing into a navigation so we don't push a history entry per key.
  useEffect(() => {
    if (q === defaults.q) return;
    const t = setTimeout(() => {
      const p = new URLSearchParams(params.toString());
      if (q) p.set("q", q);
      else p.delete("q");
      p.delete("page");
      router.replace(`?${p}`);
    }, 400);
    return () => clearTimeout(t);
  }, [q, defaults.q, params, router]);

  const set = (key: string, value: string) => {
    const p = new URLSearchParams(params.toString());
    if (value) p.set(key, value);
    else p.delete(key);
    p.delete("page");
    router.push(`?${p}`);
  };

  const hasFilters = Boolean(
    defaults.q || defaults.status || defaults.trackId || defaults.college || defaults.paid,
  );

  return (
    <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative flex-1 sm:min-w-56">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name, code, contact, college…"
          className="pl-9 h-9"
          aria-label="Search teams"
        />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
        <Select
          value={defaults.status || "all"}
          onValueChange={(v) => set("status", v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-full sm:w-40 h-9 text-xs" aria-label="Filter by status">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {Object.values(TeamStatus).map((s) => (
              <SelectItem key={s} value={s}>
                {TEAM_STATUS_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={defaults.trackId || "all"}
          onValueChange={(v) => set("trackId", v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-full sm:w-44 h-9 text-xs" aria-label="Filter by track">
            <SelectValue placeholder="Track" />
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

        <Select
          value={defaults.college || "all"}
          onValueChange={(v) => set("college", v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-full sm:w-44 h-9 text-xs" aria-label="Filter by college">
            <SelectValue placeholder="College" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All colleges</SelectItem>
            {colleges.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={defaults.paid || "all"}
          onValueChange={(v) => set("paid", v === "all" ? "" : v)}
        >
          <SelectTrigger className="w-full sm:w-36 h-9 text-xs" aria-label="Filter by entry fee">
            <SelectValue placeholder="Fee" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All fees</SelectItem>
            <SelectItem value="unpaid">Unpaid</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {hasFilters ? (
        <Button variant="ghost" size="sm" onClick={() => router.push("/admin/teams")} className="self-start sm:self-auto h-9 text-xs">
          <X className="size-4 mr-1" /> Clear
        </Button>
      ) : null}
    </div>
  );
}
