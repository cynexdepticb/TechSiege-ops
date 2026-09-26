import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireActor, requirePanelMember } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { PortalShell } from "@/components/shell/portal-shell";
import { ScoreCard } from "@/components/judge/score-card";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader, EmptyState } from "@/components/ui/fields";
import { StatCard } from "@/components/charts/stat-card";
import { formatNumber, relativeTime } from "@/lib/utils";
import { getPortalFor } from "@/lib/portals";
import { CheckCheck, ClipboardList, Hourglass } from "lucide-react";

export const metadata: Metadata = { title: "My teams" };
export const dynamic = "force-dynamic";

/**
 * Judge portal. A judge only ever sees the teams assigned to them — the
 * assignment join table is the boundary, not a filter applied afterwards.
 */
export default async function JudgePortalPage() {
  const actor = await requireActor();
  if (actor.role !== "JUDGE") redirect(getPortalFor(actor.role) ?? "/admin");
  const member = await requirePanelMember(actor);

  const assignments = await prisma.assignment.findMany({
    where: { panelId: member.id, teamId: { not: null } },
    select: {
      id: true,
      team: {
        select: {
          id: true,
          name: true,
          code: true,
          college: true,
          status: true,
          track: { select: { name: true } },
          submission: { select: { id: true, summary: true, screeningStatus: true } },
          scores: {
            where: { judgeId: member.id },
            select: {
              id: true,
              totalWeightedScore: true,
              updatedAt: true,
              comments: true,
              agenticCapability: true,
              innovation: true,
              technicalImplementation: true,
              problemRelevance: true,
              userExperience: true,
              demoPresentation: true,
            },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const teams = assignments
    .map((a) => a.team)
    .filter((t): t is NonNullable<typeof t> => t !== null)
    // Unscored first. A judge opening their portal wants the work still
    // outstanding, not an alphabetical wall of finished teams.
    .sort((a, b) => {
      const byScore = (a.scores.length > 0 ? 1 : 0) - (b.scores.length > 0 ? 1 : 0);
      return byScore || a.name.localeCompare(b.name);
    });

  const scored = teams.filter((t) => t.scores.length > 0).length;
  const pending = teams.length - scored;

  return (
    <PortalShell
      name={member.name}
      email={member.email}
      roleLabel="Judge"
    >
      <div className="p-4 sm:p-6 lg:p-8">
        <PageHeader
          title="My teams"
          description="Score each assigned team against the rubric. You can revise a score until results are announced."
        />

        <div className="mb-4 grid gap-4 sm:grid-cols-3">
          <StatCard label="Assigned" value={formatNumber(teams.length)} hint="teams to score" />
          <StatCard
            label="Scored"
            value={formatNumber(scored)}
            hint={pending > 0 ? `${pending} to go` : "all done"}
            tone={pending === 0 && teams.length > 0 ? "success" : "default"}
          />
          <StatCard
            label="Remaining"
            value={formatNumber(pending)}
            hint={pending > 0 ? "unfinished" : "you're all set"}
            tone={pending > 0 ? "warning" : "default"}
          />
        </div>

        {teams.length === 0 ? (
          <EmptyState
            title="No teams assigned yet"
            description="The mentor/judge relations team will assign teams before the event."
          />
        ) : (
          <div className="space-y-3">
            {teams.map((t) => (
              <Card key={t.id}>
                <CardContent className="p-4">
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h3 className="font-medium">{t.name}</h3>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-mono">{t.code}</span> · {t.track.name} · {t.college}
                      </p>
                    </div>
                    {t.scores.length > 0 ? (
                      <Badge variant="success">
                        <CheckCheck className="size-3" />
                        Scored {t.scores[0].totalWeightedScore.toFixed(2)} ·{" "}
                        {relativeTime(t.scores[0].updatedAt)}
                      </Badge>
                    ) : (
                      <Badge variant="warning">
                        <Hourglass className="size-3" /> Not scored
                      </Badge>
                    )}
                  </div>

                  {t.submission?.summary ? (
                    <p className="mb-3 text-sm text-muted-foreground">{t.submission.summary}</p>
                  ) : null}

                  {/* Native disclosure: no client state, so the list stays
                      collapsed until asked and still works without JS. Open by
                      default only when there is nothing to fill in. */}
                  <details open={t.scores.length === 0}>
                    <summary className="cursor-pointer list-none text-sm font-medium text-primary hover:underline">
                      {t.scores.length === 0 ? "Score this team" : "Edit score"}
                    </summary>
                    <div className="mt-3">
                      <ScoreCard
                        teamId={t.id}
                        teamName={t.name}
                        existing={
                          t.scores[0]
                            ? {
                                id: t.scores[0].id,
                                total: t.scores[0].totalWeightedScore,
                                comments: t.scores[0].comments,
                                values: {
                                  agenticCapability: t.scores[0].agenticCapability,
                                  innovation: t.scores[0].innovation,
                                  technicalImplementation: t.scores[0].technicalImplementation,
                                  problemRelevance: t.scores[0].problemRelevance,
                                  userExperience: t.scores[0].userExperience,
                                  demoPresentation: t.scores[0].demoPresentation,
                                },
                              }
                            : null
                        }
                      />
                    </div>
                  </details>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
          <ClipboardList className="size-3.5" />
          You see only the teams assigned to you. Contact the panel team to change an
          assignment.
        </p>
      </div>
    </PortalShell>
  );
}
