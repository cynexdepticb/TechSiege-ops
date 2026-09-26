import type { Metadata } from "next";
import Link from "next/link";
import { requireModule } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader, EmptyState } from "@/components/ui/fields";
import { StatCard } from "@/components/charts/stat-card";
import { MeterBar } from "@/components/charts/stat-card";
import { CRITERIA } from "@/lib/site";
import { formatNumber } from "@/lib/utils";
import { SCREENING_LABEL, SCREENING_VARIANT } from "@/lib/labels";
import { Gavel, Scale, Trophy, Users } from "lucide-react";

export const metadata: Metadata = { title: "Judging" };
export const dynamic = "force-dynamic";

export default async function JudgingPage() {
  await requireModule("judging");

  const [teams, judges] = await Promise.all([
    prisma.team.findMany({
      where: { status: { not: "DISQUALIFIED" } },
      select: {
        id: true,
        name: true,
        code: true,
        track: { select: { name: true } },
        submission: { select: { screeningStatus: true } },
        scores: {
          select: {
            totalWeightedScore: true,
            agenticCapability: true,
            innovation: true,
            technicalImplementation: true,
            problemRelevance: true,
            userExperience: true,
            demoPresentation: true,
            judge: { select: { id: true, name: true } },
          },
        },
      },
    }),
    prisma.panelMember.findMany({
      where: { kind: "JUDGE", active: true },
      select: { id: true, name: true, _count: { select: { scores: true } } },
    }),
  ]);

  /* Rank only teams that actually have scores; the rest wait at the bottom. */
  const ranked = teams
    .map((t) => {
      const n = t.scores.length;
      const avg = n > 0 ? t.scores.reduce((s, x) => s + x.totalWeightedScore, 0) / n : null;
      // Per-criterion means, so the leaderboard explains *why* a team leads.
      const criteriaMeans = CRITERIA.map((c) => {
        const vals = t.scores.map((s) => s[c.key] as number);
        return {
          ...c,
          mean: vals.length > 0 ? vals.reduce((a, b) => a + b, 0) / vals.length : 0,
        };
      });
      return { team: t, judges: n, avg, criteriaMeans };
    })
    .filter((r) => r.avg !== null)
    .sort((a, b) => (b.avg ?? 0) - (a.avg ?? 0));

  const unscored = teams.filter((t) => t.scores.length === 0).length;
  const totalScores = ranked.reduce((s, r) => s + r.judges, 0);
  const maxAvg = ranked[0]?.avg ?? 0;
  const minAvg = ranked[ranked.length - 1]?.avg ?? 0;

  /* Criterion averages across every team, for the rubric health check. */
  const rubricAverages = CRITERIA.map((c) => {
    const all = teams.flatMap((t) => t.scores.map((s) => s[c.key] as number));
    return {
      ...c,
      mean: all.length > 0 ? all.reduce((a, b) => a + b, 0) / all.length : 0,
      samples: all.length,
    };
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Judging"
        description="Weighted leaderboard. Scores are 0–10 per criterion, combined using the published rubric weights."
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Scored teams"
          value={formatNumber(ranked.length)}
          hint={`${formatNumber(totalScores)} scores in`}
        />
        <StatCard
          label="Awaiting scores"
          value={formatNumber(unscored)}
          hint={unscored > 0 ? "chase these judges" : "all teams scored"}
          tone={unscored > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Judges scoring"
          value={formatNumber(judges.filter((j) => j._count.scores > 0).length)}
          hint={`of ${formatNumber(judges.length)} active`}
        />
        <StatCard
          label="Top score"
          value={maxAvg > 0 ? maxAvg.toFixed(2) : "—"}
          hint={minAvg > 0 ? `lowest ${minAvg.toFixed(2)}` : "no scores yet"}
          tone="success"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Leaderboard</CardTitle>
              <CardDescription>
                Ranked by mean weighted score across {CRITERIA.length} criteria.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {ranked.length === 0 ? (
                <EmptyState
                  title="No scores yet"
                  description="Scores appear here as judges submit them from their portal."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[40rem] text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="w-12 px-4 py-2 font-medium">#</th>
                        <th className="px-2 py-2 font-medium">Team</th>
                        <th className="px-2 py-2 font-medium">Judges</th>
                        <th className="px-2 py-2 font-medium">Score</th>
                        <th className="px-2 py-2 font-medium">Spread</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranked.map((r, i) => {
                        const spread =
                          r.team.scores.length > 1
                            ? Math.max(...r.team.scores.map((s) => s.totalWeightedScore)) -
                              Math.min(...r.team.scores.map((s) => s.totalWeightedScore))
                            : 0;
                        return (
                          <tr key={r.team.id} className="border-b last:border-0">
                            <td className="px-4 py-2.5">
                              {i < 3 ? (
                                <span
                                  className={`inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold ${
                                    i === 0
                                      ? "bg-amber-400/20 text-amber-300"
                                      : i === 1
                                        ? "bg-slate-300/20 text-slate-200"
                                        : "bg-orange-500/20 text-orange-300"
                                  }`}
                                >
                                  {i + 1}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">{i + 1}</span>
                              )}
                            </td>
                            <td className="px-2 py-2.5">
                              <Link
                                href={`/admin/teams/${r.team.id}`}
                                className="font-medium hover:underline"
                              >
                                {r.team.name}
                              </Link>
                              <div className="text-xs text-muted-foreground">
                                {r.team.track.name}
                              </div>
                            </td>
                            <td className="px-2 py-2.5 tabular-nums text-muted-foreground">
                              {r.judges}
                            </td>
                            <td className="px-2 py-2.5">
                              <span className="font-mono font-medium">
                                {r.avg!.toFixed(2)}
                              </span>
                              {r.team.submission ? (
                                <Badge
                                  className="ml-2"
                                  variant={SCREENING_VARIANT[r.team.submission.screeningStatus]}
                                >
                                  {SCREENING_LABEL[r.team.submission.screeningStatus]}
                                </Badge>
                              ) : null}
                            </td>
                            <td className="px-2 py-2.5">
                              <MeterBar
                                label=""
                                value={Math.round(((r.avg ?? 0) / 10) * 100)}
                                max={100}
                                tone={i === 0 ? "success" : "primary"}
                                hint={
                                  r.judges > 1
                                    ? `${spread.toFixed(2)} spread across judges`
                                    : "single judge"
                                }
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {/* criterion breakdown for the leader */}
          {ranked[0] ? (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="size-4 text-amber-400" /> Leader breakdown
                </CardTitle>
                <CardDescription>{ranked[0].team.name}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {ranked[0].criteriaMeans.map((c) => (
                  <div key={c.key}>
                    <div className="flex items-baseline justify-between text-sm">
                      <span>{c.label}</span>
                      <span className="font-mono tabular-nums text-muted-foreground">
                        {c.mean.toFixed(1)}
                        <span className="text-xs"> · {Math.round(c.weight * 100)}%</span>
                      </span>
                    </div>
                    <MeterBar
                      label=""
                      value={c.mean}
                      max={10}
                      tone="primary"
                    />
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}

          {/* rubric health */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gavel className="size-4" /> Rubric averages
              </CardTitle>
              <CardDescription>Mean score per criterion across all judges</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {rubricAverages.map((c) => (
                <div key={c.key}>
                  <div className="flex items-baseline justify-between text-sm">
                    <span title={c.hint}>{c.label}</span>
                    <span className="font-mono tabular-nums text-muted-foreground">
                      {c.mean.toFixed(2)}
                    </span>
                  </div>
                  <MeterBar label="" value={c.mean} max={10} tone="primary" />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* judge participation */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="size-4" /> Judge participation
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {judges.length === 0 ? (
                <p className="text-muted-foreground">No active judges.</p>
              ) : (
                judges.map((j) => (
                  <div key={j.id} className="flex items-center justify-between">
                    <span className="truncate">{j.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {j._count.scores} scores
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Scale className="size-3.5" />
        Weights: {CRITERIA.map((c) => `${c.label} ${Math.round(c.weight * 100)}%`).join(" · ")}
      </p>
    </div>
  );
}
