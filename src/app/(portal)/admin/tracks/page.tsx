import type { Metadata } from "next";
import { requireModule } from "@/lib/guards";
import { canWrite } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader, EmptyState } from "@/components/ui/fields";
import { MeterBar } from "@/components/charts/stat-card";
import { TrackEditor } from "@/components/tracks/track-editor";
import { formatNumber, slugify } from "@/lib/utils";

export const metadata: Metadata = { title: "Tracks" };
export const dynamic = "force-dynamic";

export default async function TracksPage() {
  const actor = await requireModule("tracks");
  const canEdit = canWrite(actor, "tracks");

  const tracks = await prisma.track.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: {
      _count: { select: { teams: true } },
      teams: {
        where: { status: { not: "DISQUALIFIED" } },
        select: { id: true },
      },
    },
  });

  const totalTeams = tracks.reduce((s, t) => s + t.teams.length, 0);
  const uncapped = tracks.filter((t) => t.capacity === null);
  const overCapacity = tracks.filter((t) => t.capacity !== null && t.teams.length > t.capacity);
  const inactive = tracks.filter((t) => !t.active);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Tracks"
        description="The competition tracks, their capacity, and how full each one is."
      />

      {canEdit ? (
        <div className="mb-4 flex justify-end">
          <TrackEditor />
        </div>
      ) : null}

      {overCapacity.length > 0 ? (
        <div className="mb-4 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          <strong>Over capacity:</strong>{" "}
          {overCapacity.map((t) => t.name).join(", ")}. Raise the cap or move teams before
          announcing the final allocation.
        </div>
      ) : null}

      {tracks.length === 0 ? (
        <EmptyState title="No tracks" description="Create tracks to route registrations." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {tracks.map((t) => {
            const taken = t.teams.length;
            const pctOfCap = t.capacity ? (taken / t.capacity) * 100 : 0;
            const full = t.capacity !== null && taken >= t.capacity;
            return (
              <Card key={t.id}>
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle>{t.name}</CardTitle>
                    <div className="flex shrink-0 items-center gap-1">
                      {!t.active ? <Badge variant="muted">Inactive</Badge> : null}
                      {canEdit ? (
                        <TrackEditor
                          track={{
                            id: t.id,
                            name: t.name,
                            description: t.description,
                            requirementChecklist: t.requirementChecklist,
                            capacity: t.capacity,
                            sortOrder: t.sortOrder,
                            active: t.active,
                            taken,
                          }}
                        />
                      ) : null}
                    </div>
                  </div>
                  <CardDescription>{t.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <MeterBar
                    label={
                      t.capacity === null
                        ? `${formatNumber(taken)} teams · uncapped`
                        : `${formatNumber(taken)} of ${formatNumber(t.capacity)} places`
                    }
                    value={taken}
                    max={t.capacity ?? Math.max(taken, 1)}
                    tone={
                      t.capacity === null
                        ? "primary"
                        : full
                          ? "destructive"
                          : pctOfCap > 80
                            ? "warning"
                            : "success"
                    }
                    hint={
                      t.capacity === null
                        ? undefined
                        : `${formatNumber(Math.max(0, t.capacity - taken))} places left`
                    }
                  />

                  {t.requirementChecklist.length > 0 ? (
                    <details className="text-sm">
                      <summary className="cursor-pointer text-muted-foreground">
                        What teams submit ({t.requirementChecklist.length})
                      </summary>
                      <ul className="mt-2 list-inside list-disc space-y-1 text-muted-foreground">
                        {t.requirementChecklist.map((r) => (
                          <li key={r}>{r}</li>
                        ))}
                      </ul>
                    </details>
                  ) : null}

                  <p className="font-mono text-xs text-muted-foreground">/tracks/{slugify(t.name)}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div className="mt-4 grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 text-sm">
            <div className="text-muted-foreground">Teams allocated</div>
            <div className="text-2xl font-semibold tabular-nums">{formatNumber(totalTeams)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-sm">
            <div className="text-muted-foreground">Uncapped tracks</div>
            <div className="text-2xl font-semibold tabular-nums">
              {formatNumber(uncapped.length)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-sm">
            <div className="text-muted-foreground">Inactive tracks</div>
            <div className="text-2xl font-semibold tabular-nums">
              {formatNumber(inactive.length)}
            </div>
          </CardContent>
        </Card>
      </div>

      {!canEdit ? (
        <p className="mt-4 text-xs text-muted-foreground">
          Read-only — track capacity and availability are managed by the core team.
        </p>
      ) : null}
    </div>
  );
}
