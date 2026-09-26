import type { Metadata } from "next";
import Link from "next/link";
import { requireModule } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader, EmptyState } from "@/components/ui/fields";
import { MeterBar, StatCard } from "@/components/charts/stat-card";
import { CheckpointCell } from "@/components/checkin/checkpoint-cell";
import { formatNumber } from "@/lib/utils";
import { CHECKPOINTS } from "@/lib/site";
import { RAG, type RagKey } from "@/lib/labels";
import type { CheckpointName } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Checkpoint board" };
export const dynamic = "force-dynamic";

/** How many checkpoints behind before a team is flagged. */
const AT_RISK_AFTER = 1;
const ACTION_AFTER = 2;

export default async function CheckpointsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireModule("checkin");
  const sp = await searchParams;
  const trackFilter = typeof sp.trackId === "string" ? sp.trackId : "";

  const [teams, tracks] = await Promise.all([
    prisma.team.findMany({
      where: {
        status: { not: "DISQUALIFIED" },
        ...(trackFilter ? { trackId: trackFilter } : {}),
      },
      orderBy: { code: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        track: { select: { id: true, name: true } },
        participants: { select: { id: true } },
        checkpoints: {
          select: { id: true, checkpoint: true, createdAt: true, notedBy: true, note: true },
        },
      },
    }),
    prisma.track.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  /* Progress = how many of the 5 checkpoints this team has logged. */
  const rows = teams.map((t) => {
    const byName = new Map<CheckpointName, (typeof t.checkpoints)[number]>();
    // Later scans win if a checkpoint was logged more than once.
    for (const c of [...t.checkpoints].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
      byName.set(c.checkpoint, c);
    }
    const reached = CHECKPOINTS.filter((c) => byName.has(c.key)).length;
    const remaining = CHECKPOINTS.length - reached;
    const rag: RagKey =
      remaining >= ACTION_AFTER ? "RED" : remaining === AT_RISK_AFTER ? "AMBER" : "GREEN";
    return { team: t, byName, reached, remaining, rag };
  });

  const counts: Record<RagKey, number> = { GREEN: 0, AMBER: 0, RED: 0 };
  for (const r of rows) counts[r.rag]++;
  const byCheckpoint = CHECKPOINTS.map((c) => ({
    ...c,
    done: rows.filter((r) => r.byName.has(c.key)).length,
  }));

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Checkpoint board"
        description="Every team against every checkpoint. Volunteers tap a cell the moment a team clears a stage."
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-3">
        <StatCard
          label="On track"
          value={formatNumber(counts.GREEN)}
          hint="all checkpoints logged"
          tone="success"
        />
        <StatCard
          label="At risk"
          value={formatNumber(counts.AMBER)}
          hint="one checkpoint behind"
          tone={counts.AMBER > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Needs action"
          value={formatNumber(counts.RED)}
          hint="two or more behind"
          tone={counts.RED > 0 ? "destructive" : "default"}
        />
      </div>

      {/* progress per checkpoint */}
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>Completion by checkpoint</CardTitle>
          <CardDescription>{formatNumber(rows.length)} teams on the board</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          {byCheckpoint.map((c) => (
            <MeterBar
              key={c.key}
              label={c.label}
              value={c.done}
              max={rows.length}
              tone={c.done === rows.length ? "success" : "primary"}
            />
          ))}
        </CardContent>
      </Card>

      {/* the board itself */}
      <Card>
        <CardHeader>
          <CardTitle>Teams</CardTitle>
          <CardDescription>Select a track to narrow the board.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="flex flex-wrap gap-2 border-b px-4 py-3">
            <a
              href="/admin/checkpoints"
              className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                trackFilter === ""
                  ? "border-primary bg-primary/10 text-foreground"
                  : "text-muted-foreground hover:bg-accent"
              }`}
            >
              All tracks
            </a>
            {tracks.map((t) => (
              <a
                key={t.id}
                href={`/admin/checkpoints?trackId=${t.id}`}
                className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                  trackFilter === t.id
                    ? "border-primary bg-primary/10 text-foreground"
                    : "text-muted-foreground hover:bg-accent"
                }`}
              >
                {t.name}
              </a>
            ))}
          </div>

          {rows.length === 0 ? (
            <EmptyState title="No teams" description="Nothing to show for this filter." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[52rem] text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="px-4 py-2 font-medium">Team</th>
                    <th className="px-2 py-2 font-medium">RAG</th>
                    {CHECKPOINTS.map((c) => (
                      <th key={c.key} className="px-2 py-2 text-center font-medium">
                        {c.short}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.team.id} className="border-b last:border-0">
                      <td className="px-4 py-2">
                        <Link
                          href={`/admin/teams/${r.team.id}`}
                          className="font-medium hover:underline"
                        >
                          {r.team.name}
                        </Link>
                        <div className="font-mono text-xs text-muted-foreground">
                          {r.team.code} · {r.team.track.name}
                        </div>
                      </td>
                      <td className="px-2 py-2">
                        <Badge variant={RAG[r.rag].variant}>
                          <span className={`size-1.5 rounded-full ${RAG[r.rag].dot}`} />
                          {RAG[r.rag].label}
                        </Badge>
                      </td>
                      {CHECKPOINTS.map((c) => {
                        const hit = r.byName.get(c.key);
                        return (
                          <td key={c.key} className="px-2 py-2 text-center">
                            <CheckpointCell
                              teamId={r.team.id}
                              teamCode={r.team.code}
                              checkpoint={c.key}
                              checkpointLabel={c.label}
                              loggedAt={hit?.createdAt.toISOString() ?? null}
                              loggedBy={hit?.notedBy ?? null}
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
