import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireActor, requirePanelMember } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { PortalShell } from "@/components/shell/portal-shell";
import { MentorNotes } from "@/components/mentor/mentor-notes";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader, EmptyState } from "@/components/ui/fields";
import { StatCard } from "@/components/charts/stat-card";
import { MeterBar } from "@/components/charts/stat-card";
import { CHECKPOINTS } from "@/lib/site";
import { formatNumber } from "@/lib/utils";
import { getPortalFor } from "@/lib/portals";
import { CircleCheckBig, MessageSquare, Users } from "lucide-react";

export const metadata: Metadata = { title: "My teams" };
export const dynamic = "force-dynamic";

/**
 * Mentor portal. Same boundary as the judge portal: the assignment join table
 * decides which teams appear, not a filter applied after the fact.
 */
export default async function MentorPortalPage() {
  const actor = await requireActor();
  if (actor.role !== "MENTOR") redirect(getPortalFor(actor.role) ?? "/admin");
  const member = await requirePanelMember(actor);

  const assignments = await prisma.assignment.findMany({
    where: { panelId: member.id, teamId: { not: null } },
    select: {
      id: true,
      notes: true,
      team: {
        select: {
          id: true,
          name: true,
          code: true,
          college: true,
          contactName: true,
          contactEmail: true,
          track: { select: { name: true } },
          submission: {
            select: { id: true, screeningStatus: true, submittedAt: true, summary: true },
          },
          checkpoints: { select: { checkpoint: true, createdAt: true, note: true } },
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const teams = assignments
    .map((a) => ({ assignmentId: a.id, notes: a.notes, team: a.team }))
    .filter((r): r is { assignmentId: string; notes: string; team: NonNullable<typeof r.team> } =>
      r.team !== null,
    );

  const withNotes = teams.filter((r) => r.notes.trim().length > 0).length;
  const atRisk = teams.filter((r) => {
    const done = new Set(r.team.checkpoints.map((c) => c.checkpoint));
    return CHECKPOINTS.filter((c) => !done.has(c.key)).length >= 2;
  }).length;

  return (
    <PortalShell name={member.name} email={member.email} roleLabel="Mentor">
      <div className="p-4 sm:p-6 lg:p-8">
        <PageHeader
          title="My teams"
          description="Your assigned teams, how far each has progressed, and a place to leave checkpoint feedback."
        />

        <div className="mb-4 grid gap-4 sm:grid-cols-3">
          <StatCard label="Assigned" value={formatNumber(teams.length)} hint="teams to mentor" />
          <StatCard
            label="Need attention"
            value={formatNumber(atRisk)}
            hint={atRisk > 0 ? "two or more checkpoints behind" : "all progressing"}
            tone={atRisk > 0 ? "warning" : "success"}
          />
          <StatCard
            label="Feedback recorded"
            value={formatNumber(withNotes)}
            hint={`of ${formatNumber(teams.length)} teams`}
          />
        </div>

        {teams.length === 0 ? (
          <EmptyState
            title="No teams assigned yet"
            description="The mentor/judge relations team will allocate teams before the event."
          />
        ) : (
          <div className="space-y-3">
            {teams.map((r) => {
              const done = new Set(r.team.checkpoints.map((c) => c.checkpoint));
              const lastNote = [...r.team.checkpoints]
                .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
                .find((c) => c.note.trim().length > 0);

              return (
                <Card key={r.assignmentId}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <h3 className="font-medium">{r.team.name}</h3>
                        <p className="text-xs text-muted-foreground">
                          <span className="font-mono">{r.team.code}</span> · {r.team.track.name} ·{" "}
                          {r.team.college}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          <a
                            href={`mailto:${r.team.contactEmail}`}
                            className="hover:underline"
                          >
                            {r.team.contactName} · {r.team.contactEmail}
                          </a>
                        </p>
                      </div>
                      {r.team.submission ? (
                        <Badge variant="success">
                          <CircleCheckBig className="size-3" /> Submitted
                        </Badge>
                      ) : (
                        <Badge variant="muted">No submission</Badge>
                      )}
                    </div>

                    <MeterBar
                      label="Checkpoints reached"
                      value={done.size}
                      max={CHECKPOINTS.length}
                      tone={
                        done.size === CHECKPOINTS.length
                          ? "success"
                          : CHECKPOINTS.length - done.size >= 2
                            ? "warning"
                            : "primary"
                      }
                    />

                    {r.team.submission?.summary ? (
                      <p className="text-sm text-muted-foreground">{r.team.submission.summary}</p>
                    ) : null}

                    {lastNote ? (
                      <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">
                        <MessageSquare className="mr-1 inline size-3" />
                        Volunteer note: {lastNote.note}
                      </p>
                    ) : null}

                    <MentorNotes
                      assignmentId={r.assignmentId}
                      teamName={r.team.name}
                      initial={r.notes}
                    />
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Users className="size-3.5" />
          You see only the teams assigned to you. Contact the panel team to change an
          assignment.
        </p>
      </div>
    </PortalShell>
  );
}
