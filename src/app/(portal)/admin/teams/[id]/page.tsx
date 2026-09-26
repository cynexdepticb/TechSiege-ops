import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireModule } from "@/lib/guards";
import { canWrite } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader } from "@/components/ui/fields";
import { Separator } from "@/components/ui/primitives";
import { TeamControls } from "@/components/teams/team-controls";
import { DeleteTeamButton } from "@/components/teams/delete-team-button";
import { formatDateTime } from "@/lib/utils";
import { CHECKPOINT_LABEL, TEAM_STATUS_LABEL, TEAM_STATUS_VARIANT } from "@/lib/authz-lite";
import { SCREENING_LABEL, SCREENING_VARIANT } from "@/lib/labels";
import { CHECKPOINTS } from "@/lib/site";
import { teamCheckinUrl } from "@/lib/registration";
import { siteOrigin } from "@/lib/site";
import { QrBadge } from "@/components/teams/qr-badge";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = { title: "Team" };
export const dynamic = "force-dynamic";

export default async function TeamDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const actor = await requireModule("teams");
  const { id } = await params;

  const team = await prisma.team.findUnique({
    where: { id },
    include: {
      track: true,
      participants: { orderBy: [{ role: "asc" }, { createdAt: "asc" }] },
      submission: true,
      checkpoints: { orderBy: { createdAt: "desc" } },
      scores: { include: { judge: { select: { id: true, name: true, org: true } } } },
      assignments: { include: { panel: { select: { id: true, name: true, kind: true } } } },
      comms: { orderBy: { createdAt: "desc" }, take: 8 },
    },
  });

  if (!team) notFound();

  const canEdit = canWrite(actor, "teams");
  const tracks = await prisma.track.findMany({
    where: { active: true },
    select: { id: true, name: true },
    orderBy: { sortOrder: "asc" },
  });

  const checkinUrl = teamCheckinUrl(siteOrigin(), team.qrToken);

  const done = new Set(team.checkpoints.map((c) => c.checkpoint));
  const avgScore =
    team.scores.length > 0
      ? team.scores.reduce((s, x) => s + x.totalWeightedScore, 0) / team.scores.length
      : null;

  /* Mirrors the DELETE route's refusal list so the UI can say up front that a
     team is undeletable, rather than letting someone arm the button and then
     fail. The API re-checks regardless — this is only to explain the rule. */
  const undeletableBecause = [
    ...(team.scores.length > 0 ? [`${team.scores.length} recorded score(s)`] : []),
    ...(team.submission ? ["a submitted project"] : []),
    ...(team.checkpoints.length > 0 ? [`${team.checkpoints.length} check-in scan(s)`] : []),
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <Link
        href="/admin/teams"
        className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All teams
      </Link>

      <PageHeader
        title={team.name}
        description={`${team.code} · ${team.track.name}`}
        actions={
          <Badge variant={TEAM_STATUS_VARIANT[team.status]}>
            {TEAM_STATUS_LABEL[team.status]}
          </Badge>
        }
      />

      {team.disqualifiedReason ? (
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <strong>Disqualified.</strong> {team.disqualifiedReason}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* team + contact */}
          <Card>
            <CardHeader>
              <CardTitle>Registration</CardTitle>
              <CardDescription>
                Registered {formatDateTime(team.createdAt)}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 text-sm sm:grid-cols-2">
              <Detail label="College" value={team.college} />
              <Detail label="City" value={team.city || "—"} />
              <Detail label="Lead" value={team.contactName || "—"} />
              <Detail
                label="Email"
                value={
                  <a href={`mailto:${team.contactEmail}`} className="hover:underline">
                    {team.contactEmail}
                  </a>
                }
              />
              <Detail label="Phone" value={team.contactPhone || "—"} />
              <Detail label="Track" value={team.track.name} />
              {team.projectIdea ? (
                <div className="sm:col-span-2">
                  <Detail label="Project idea" value={team.projectIdea} />
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* members */}
          <Card>
            <CardHeader>
              <CardTitle>Members</CardTitle>
              <CardDescription>{team.participants.length} on this team</CardDescription>
            </CardHeader>
            <CardContent className="divide-y">
              {team.participants.map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="font-medium">{p.name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {p.email}
                      {p.phone ? ` · ${p.phone}` : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {p.year ? (
                      <span className="text-xs text-muted-foreground">{p.year}</span>
                    ) : null}
                    {p.role === "LEADER" ? <Badge>Lead</Badge> : null}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* submission */}
          <Card>
            <CardHeader>
              <CardTitle>Submission</CardTitle>
              <CardDescription>
                {team.submission
                  ? `Submitted ${formatDateTime(team.submission.submittedAt)}`
                  : "Nothing submitted yet"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {team.submission ? (
                <>
                  <div className="mb-3 flex items-center gap-2">
                    <Badge variant={SCREENING_VARIANT[team.submission.screeningStatus]}>
                      {SCREENING_LABEL[team.submission.screeningStatus]}
                    </Badge>
                    {team.submission.lockedAt ? <Badge variant="outline">Locked</Badge> : null}
                  </div>
                  {team.submission.summary ? (
                    <p className="mb-3 text-sm text-muted-foreground">
                      {team.submission.summary}
                    </p>
                  ) : null}
                  <div className="grid gap-3 text-sm sm:grid-cols-2">
                    <LinkRow label="Repository" href={team.submission.githubRepoUrl} />
                    <LinkRow label="Demo video" href={team.submission.demoVideoUrl} />
                    {team.submission.architectureDiagramUrl ? (
                      <LinkRow
                        label="Architecture"
                        href={team.submission.architectureDiagramUrl}
                      />
                    ) : null}
                    {team.submission.apiDeclaration ? (
                      <Detail label="API declaration" value={team.submission.apiDeclaration} />
                    ) : null}
                  </div>
                  {team.submission.screeningNotes ? (
                    <>
                      <Separator className="my-3" />
                      <p className="text-sm">
                        <strong>Screening notes.</strong> {team.submission.screeningNotes}
                      </p>
                    </>
                  ) : null}
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  This team has not uploaded a submission.
                </p>
              )}
            </CardContent>
          </Card>

          {/* scores */}
          <Card>
            <CardHeader>
              <CardTitle>Judging</CardTitle>
              <CardDescription>
                {avgScore !== null
                  ? `Average weighted score ${avgScore.toFixed(2)} / 10 across ${team.scores.length} ${team.scores.length === 1 ? "judge" : "judges"}`
                  : "No scores submitted yet"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {team.scores.map((s) => (
                <div key={s.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">{s.judge.name}</span>
                      {s.judge.org ? (
                        <span className="text-xs text-muted-foreground"> · {s.judge.org}</span>
                      ) : null}
                    </div>
                    <span className="font-mono font-medium">
                      {s.totalWeightedScore.toFixed(2)}
                    </span>
                  </div>
                  {s.comments ? (
                    <p className="mt-2 text-muted-foreground">{s.comments}</p>
                  ) : null}
                </div>
              ))}
              {team.scores.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing scored yet.</p>
              ) : null}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          {/* controls */}
          {canEdit ? (
            <TeamControls
              team={{
                id: team.id,
                status: team.status,
                trackId: team.trackId,
                disqualifiedReason: team.disqualifiedReason ?? "",
              }}
              tracks={tracks}
            />
          ) : null}

          {/* Deletion is the only irreversible action here, so it is gated on the
              same write permission and explains itself when history blocks it. */}
          {canEdit ? (
            <DeleteTeamButton
              team={{ id: team.id, code: team.code, name: team.name }}
              blockers={undeletableBecause}
            />
          ) : null}

          {/* check-in QR */}
          <Card>
            <CardHeader>
              <CardTitle>Check-in code</CardTitle>
              <CardDescription>Scan this at the registration desk</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-3">
              <QrBadge value={checkinUrl} />
              <p className="text-center font-mono text-xs text-muted-foreground">
                {checkinUrl}
              </p>
            </CardContent>
          </Card>

          {/* checkpoints */}
          <Card>
            <CardHeader>
              <CardTitle>Checkpoints</CardTitle>
              <CardDescription>{done.size} of {CHECKPOINTS.length} reached</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {CHECKPOINTS.map((c) => {
                const hit = done.has(c.key);
                return (
                  <div key={c.key} className="flex items-center justify-between text-sm">
                    <span className={hit ? "" : "text-muted-foreground"}>{c.label}</span>
                    <span
                      className={`size-2 rounded-full ${hit ? "bg-emerald-400" : "bg-muted-foreground/30"}`}
                      aria-label={hit ? "reached" : "not reached"}
                    />
                  </div>
                );
              })}
              {team.checkpoints.length > 0 ? (
                <>
                  <Separator className="my-3" />
                  <div className="space-y-1 text-xs text-muted-foreground">
                    {team.checkpoints.slice(0, 6).map((c) => (
                      <div key={c.id}>
                        {CHECKPOINT_LABEL[c.checkpoint]} · {formatDateTime(c.createdAt)}
                        {c.notedBy ? ` · ${c.notedBy}` : ""}
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>

          {/* panel */}
          <Card>
            <CardHeader>
              <CardTitle>Assigned panel</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {team.assignments.length === 0 ? (
                <p className="text-muted-foreground">Nobody assigned yet.</p>
              ) : (
                team.assignments.map((a) => (
                  <div key={a.id} className="flex items-center justify-between">
                    <span>{a.panel.name}</span>
                    <Badge variant="outline">{a.panel.kind === "JUDGE" ? "Judge" : "Mentor"}</Badge>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          {/* comms */}
          <Card>
            <CardHeader>
              <CardTitle>Recent emails</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-xs text-muted-foreground">
              {team.comms.length === 0 ? (
                <p>No emails sent to this team yet.</p>
              ) : (
                team.comms.map((c) => (
                  <div key={c.id} className="truncate">
                    {formatDateTime(c.createdAt)} · {c.subject}
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 break-words">{value}</div>
    </div>
  );
}

function LinkRow({ label, href }: { label: string; href: string }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        className="mt-0.5 inline-block break-all hover:underline"
      >
        {href}
      </a>
    </div>
  );
}
