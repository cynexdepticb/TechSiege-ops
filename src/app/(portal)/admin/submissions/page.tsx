import type { Metadata } from "next";
import Link from "next/link";
import { requireModule } from "@/lib/guards";
import { canWrite } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { isSubmissionLocked } from "@/lib/settings";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader, EmptyState } from "@/components/ui/fields";
import { StatCard } from "@/components/charts/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScreeningControls } from "@/components/submissions/screening-controls";
import { formatDateTime, formatNumber, relativeTime } from "@/lib/utils";
import { SCREENING_LABEL, SCREENING_VARIANT } from "@/lib/labels";
import { ScreeningStatus } from "@/generated/prisma/enums";
import { Clock } from "lucide-react";

export const metadata: Metadata = { title: "Submissions" };
export const dynamic = "force-dynamic";

export default async function SubmissionsPage() {
  const actor = await requireModule("submissions");
  const canEdit = canWrite(actor, "submissions");
  const locked = await isSubmissionLocked();

  const [submissions, expected, total] = await Promise.all([
    prisma.submission.findMany({
      orderBy: { submittedAt: "desc" },
      include: {
        team: {
          select: {
            id: true,
            name: true,
            code: true,
            track: { select: { name: true } },
            _count: { select: { participants: true } },
          },
        },
        screenedBy: { select: { name: true } },
      },
    }),
    // Teams still eligible to submit: not disqualified, not withdrawn.
    prisma.team.count({ where: { status: { not: "DISQUALIFIED" } } }),
    prisma.team.count(),
  ]);

  const byStatus = (s: ScreeningStatus) => submissions.filter((x) => x.screeningStatus === s).length;
  const pending = byStatus(ScreeningStatus.PENDING);
  const advance = byStatus(ScreeningStatus.ADVANCE);
  const received = submissions.length;
  const missing = Math.max(0, expected - received);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Submissions"
        description={
          locked
            ? "The submission window has closed. Screening decisions can still be recorded."
            : "Track what has arrived and screen it for the next round."
        }
        actions={locked ? <Badge variant="warning">Submissions locked</Badge> : undefined}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Received"
          value={formatNumber(received)}
          hint={`of ${formatNumber(expected)} eligible teams`}
        />
        <StatCard
          label="Awaiting screening"
          value={formatNumber(pending)}
          hint={pending > 0 ? "needs a decision" : "queue is clear"}
          tone={pending > 0 ? "warning" : "default"}
        />
        <StatCard
          label="Advancing"
          value={formatNumber(advance)}
          hint="cleared screening"
          tone="success"
        />
        <StatCard
          label="Not received"
          value={formatNumber(missing)}
          hint={missing > 0 ? "chase these teams" : "all teams submitted"}
          tone={missing > 0 ? "destructive" : "default"}
        />
      </div>

      <Card>
        <CardContent className="p-0">
          {submissions.length === 0 ? (
            <EmptyState
              title="No submissions yet"
              description="Submitted repositories and demos will appear here."
            />
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Team</TableHead>
                    <TableHead>Track</TableHead>
                    <TableHead>Repository</TableHead>
                    <TableHead>Demo</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Screening</TableHead>
                    {canEdit ? <TableHead className="text-right">Decide</TableHead> : null}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submissions.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell>
                        <Link
                          href={`/admin/teams/${s.team.id}`}
                          className="font-medium hover:underline"
                        >
                          {s.team.name}
                        </Link>
                        <div className="font-mono text-xs text-muted-foreground">
                          {s.team.code}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{s.team.track.name}</TableCell>
                      <TableCell className="text-sm">
                        <a
                          href={s.githubRepoUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex max-w-[16rem] items-center gap-1 truncate hover:underline"
                        >
                          {s.githubRepoUrl.replace(/^https?:\/\//, "")}
                        </a>
                      </TableCell>
                      <TableCell className="text-sm">
                        <a
                          href={s.demoVideoUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="hover:underline"
                        >
                          Watch
                        </a>
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        <div title={formatDateTime(s.submittedAt)}>
                          {relativeTime(s.submittedAt)}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={SCREENING_VARIANT[s.screeningStatus]}>
                          {SCREENING_LABEL[s.screeningStatus]}
                        </Badge>
                        {s.screenedBy ? (
                          <div className="mt-0.5 text-xs text-muted-foreground">
                            by {s.screenedBy.name}
                          </div>
                        ) : null}
                      </TableCell>
                      {canEdit ? (
                        <TableCell className="text-right">
                          <ScreeningControls
                            submission={{
                              id: s.id,
                              status: s.screeningStatus,
                              notes: s.screeningNotes,
                            }}
                          />
                        </TableCell>
                      ) : null}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <p className="mt-4 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="size-3.5" />
        {received} of {formatNumber(total)} registered teams have submitted. Screening
        decisions are recorded in the audit log.
      </p>
    </div>
  );
}
