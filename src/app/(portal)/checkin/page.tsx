import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireActor } from "@/lib/guards";
import { canWrite } from "@/lib/authz";
import { CheckinScanner } from "@/components/checkin/scanner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getSettings } from "@/lib/settings";
import { formatDateTime, relativeTime } from "@/lib/utils";
import { CHECKPOINTS } from "@/lib/site";
import { signOutAction } from "@/app/actions";
import { initials } from "@/lib/utils";
import { LogOut, ScanLine } from "lucide-react";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = { title: "Check-in" };
export const dynamic = "force-dynamic";

/**
 * Volunteer check-in desk. Deliberately outside /admin and built for a phone:
 * volunteers get no sidebar and no other modules, just the scanner, the live
 * tally and their own recent scans.
 */
export default async function VolunteerCheckinPage() {
  const actor = await requireActor();
  if (actor.role !== "VOLUNTEER") redirect("/admin/checkin");

  if (!canWrite(actor, "checkin")) redirect("/admin");

  const [settings, totals, mine] = await Promise.all([
    getSettings(),
    prisma.team.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.checkpointLog.findMany({
      where: { scannedById: actor.id },
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        checkpoint: true,
        createdAt: true,
        team: { select: { code: true, name: true } },
      },
    }),
  ]);

  const byStatus = new Map(totals.map((t) => [t.status, t._count._all]));
  const checkedIn = byStatus.get("CHECKED_IN") ?? 0;
  const confirmed = byStatus.get("CONFIRMED") ?? 0;
  const pending = byStatus.get("PENDING") ?? 0;
  const registered = checkedIn + confirmed + pending;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex size-8 items-center justify-center rounded-full bg-primary/15 text-xs font-semibold text-primary">
              {initials(actor.name)}
            </span>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{actor.name}</div>
              <div className="text-xs text-muted-foreground">Volunteer</div>
            </div>
          </div>
          <form action={signOutAction}>
            <Button type="submit" variant="ghost" size="icon-sm" aria-label="Sign out">
              <LogOut className="size-4" />
            </Button>
          </form>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 p-4 pb-10">
        <div className="flex items-center gap-2">
          <ScanLine className="size-5 text-primary" />
          <h1 className="text-lg font-semibold">Check-in desk</h1>
        </div>

        {/* live tally — the number a volunteer is asked for over the radio */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <Tally label="Checked in" value={checkedIn} tone="success" />
          <Tally label="Confirmed" value={confirmed} />
          <Tally label="Awaiting" value={pending} tone={pending > 0 ? "warning" : "muted"} />
        </div>
        <p className="text-center text-xs text-muted-foreground">
          {registered} teams registered · submission deadline{" "}
          {formatDateTime(settings.submissionDeadline)}
        </p>

        <CheckinScanner actorName={actor.name} />

        <Card>
          <CardContent className="p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-medium">My recent scans</h2>
              {mine.length > 0 ? (
                <span className="text-xs text-muted-foreground">last {mine.length}</span>
              ) : null}
            </div>
            {mine.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing yet — your scans will show up here.
              </p>
            ) : (
              <ul className="divide-y text-sm">
                {mine.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-3 py-1.5">
                    <div className="min-w-0">
                      <span className="font-mono text-xs">{m.team.code}</span>{" "}
                      <span className="truncate text-muted-foreground">{m.team.name}</span>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge variant="outline">
                        {CHECKPOINTS.find((c) => c.key === m.checkpoint)?.short ?? m.checkpoint}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {relativeTime(m.createdAt)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function Tally({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: number;
  tone?: "default" | "success" | "warning" | "muted";
}) {
  const toneClass = {
    default: "text-foreground",
    success: "text-emerald-400",
    warning: "text-amber-400",
    muted: "text-muted-foreground",
  }[tone];

  return (
    <div className="rounded-lg border p-3">
      <div className={`text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}
