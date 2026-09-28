import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { requireModule } from "@/lib/guards";
import { canWrite } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { PageHeader, EmptyState } from "@/components/ui/fields";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { TeamStatusFilter } from "@/components/teams/team-status-filter";
import { RowDeleteButton } from "@/components/teams/row-delete-button";
import { RowMarkPaid } from "@/components/teams/row-mark-paid";
import { RowSendTicket } from "@/components/teams/row-send-ticket";
import { formatDate, formatDateTime, formatNumber } from "@/lib/utils";
import { TEAM_STATUS_LABEL, TEAM_STATUS_VARIANT } from "@/lib/authz-lite";
import { SCREENING_LABEL } from "@/lib/labels";
import { getSettings } from "@/lib/settings";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Prisma } from "@/generated/prisma/client";
import { TeamStatus, ScreeningStatus, PaymentStatus } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Teams" };
export const dynamic = "force-dynamic";

const PER_PAGE = 25;

type SP = Record<string, string | string[] | undefined>;

const one = (v: string | string[] | undefined): string | undefined =>
  Array.isArray(v) ? v[0] : v;

export default async function TeamsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const actor = await requireModule("teams");
  const sp = await searchParams;

  /* Deletion is destructive, so the column only appears for those who may
     actually use it. authz restricts teams writes to SUPER_ADMIN. */
  const canWriteTeams = canWrite(actor, "teams");

  const q = one(sp.q)?.trim() ?? "";
  const status = one(sp.status) as TeamStatus | undefined;
  const trackId = one(sp.trackId);
  const college = one(sp.college) ?? "";
  const paidRaw = one(sp.paid);
  const paid = paidRaw === "unpaid" || paidRaw === "paid" ? paidRaw : "";
  const page = Math.max(1, Number(one(sp.page) ?? 1) || 1);

  const where: Prisma.TeamWhereInput = {};
  if (status && Object.values(TeamStatus).includes(status)) where.status = status;
  if (trackId) where.trackId = trackId;
  if (college) where.college = { equals: college, mode: "insensitive" };
  if (paid) where.paymentStatus = paid === "unpaid" ? PaymentStatus.UNPAID : PaymentStatus.PAID;
  if (q) {
    where.OR = [
      { name: { contains: q, mode: "insensitive" } },
      { code: { contains: q, mode: "insensitive" } },
      { contactName: { contains: q, mode: "insensitive" } },
      { contactEmail: { contains: q, mode: "insensitive" } },
      { college: { contains: q, mode: "insensitive" } },
    ];
  }

  const [teams, total, allTotal, tracks, colleges, settings] = await Promise.all([
    prisma.team.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PER_PAGE,
      take: PER_PAGE,
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        college: true,
        city: true,
        contactName: true,
        contactEmail: true,
        createdAt: true,
        paymentStatus: true,
        paidAt: true,
        ticketSentAt: true,
        track: { select: { id: true, name: true } },
        // `scores` is fetched so the delete affordance can say up front that a
        // team is undeletable, matching what the DELETE route refuses on.
        _count: { select: { participants: true, checkpoints: true, scores: true } },
        submission: { select: { id: true, screeningStatus: true, submittedAt: true } },
      },
    }),
    prisma.team.count({ where }),
    // Unfiltered, so the header can say "0 of 12 match" rather than implying
    // the whole event has no teams.
    prisma.team.count(),
    prisma.track.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
    prisma.team.findMany({
      distinct: ["college"],
      select: { college: true },
      orderBy: { college: "asc" },
    }),
    getSettings(),
  ]);

  const pages = Math.max(1, Math.ceil(total / PER_PAGE));
  const canEdit = canWrite(actor, "teams");
  const filtered = Boolean(q || status || trackId || college || paid);

  /* `total` is filter-scoped, so it must never be presented as the number of
     registered teams — with a filter on that reads as "you have none", which
     contradicts the "No teams match" empty state right below it. Phrased as a
     noun ("Showing 3 of 12") so the verb never has to agree with the count. */
  const summary = !filtered
    ? `${formatNumber(total)} registered ${total === 1 ? "team" : "teams"}.`
    : total === 0
      ? `No teams match these filters · ${formatNumber(allTotal)} registered in total.`
      : `Showing ${formatNumber(total)} of ${formatNumber(allTotal)} registered teams.`;

  /* Preserve the active filters when paging or exporting. */
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries({ q, status: status ?? "", trackId, college, paid })) {
    if (v) qs.set(k, v);
  }
  const pageHref = (n: number) => {
    const p = new URLSearchParams(qs);
    p.set("page", String(n));
    return `?${p}`;
  };
  const csvHref = `/api/admin/teams?${qs}&format=csv`;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Teams"
        description={summary}
        actions={
          <Button asChild variant="outline" size="sm" className="w-full sm:w-auto">
            <a href={csvHref}>Export CSV</a>
          </Button>
        }
      />

      <Suspense fallback={<div className="mb-4 h-9" />}>
        <TeamStatusFilter
          tracks={tracks}
          colleges={colleges.map((c) => c.college)}
          defaults={{ q, status: status ?? "", trackId: trackId ?? "", college, paid }}
        />
      </Suspense>

      <Card>
        <CardContent className="p-0">
          {teams.length === 0 ? (
            <EmptyState
              title="No teams match"
              description={
                filtered
                  ? "Try clearing a filter."
                  : "Registrations will appear here as they come in."
              }
              action={
                filtered ? (
                  <Button asChild variant="outline" size="sm">
                    <Link href="/admin/teams">Clear filters</Link>
                  </Button>
                ) : null
              }
            />
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Team</TableHead>
                      <TableHead>Track</TableHead>
                      <TableHead>College</TableHead>
                      <TableHead>Size</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Fee</TableHead>
                      <TableHead>Screening</TableHead>
                      <TableHead>Registered</TableHead>
                      {canWriteTeams ? (
                        <TableHead className="w-10">
                          <span className="sr-only">Actions</span>
                        </TableHead>
                      ) : null}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {teams.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell>
                          <Link
                            href={`/admin/teams/${t.id}`}
                            className="font-medium hover:underline"
                          >
                            {t.name}
                          </Link>
                          <div className="font-mono text-xs text-muted-foreground">
                            {t.code}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">{t.track.name}</TableCell>
                        <TableCell className="text-sm">
                          {t.college}
                          {t.city ? (
                            <div className="text-xs text-muted-foreground">{t.city}</div>
                          ) : null}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {t._count.participants}
                        </TableCell>
                        <TableCell>
                          <Badge variant={TEAM_STATUS_VARIANT[t.status]}>
                            {TEAM_STATUS_LABEL[t.status]}
                          </Badge>
                        </TableCell>
                        {/* Fee and ticket are separate facts: a team can have paid
                            and still be waiting on its ticket, which is the state
                            worth spotting before event day. */}
                        <TableCell>
                          <span className="flex flex-col items-start gap-1">
                            <Badge
                              variant={t.paymentStatus === "PAID" ? "success" : "muted"}
                              title={
                                t.paidAt
                                  ? `Confirmed ${formatDateTime(t.paidAt)}`
                                  : "Entry fee not confirmed yet"
                              }
                            >
                              {t.paymentStatus === "PAID" ? "Paid" : "Unpaid"}
                            </Badge>
                            {t.paymentStatus === "PAID" && !t.ticketSentAt ? (
                              <span className="text-[11px] text-amber-500">
                                no ticket sent
                              </span>
                            ) : null}
                          </span>
                        </TableCell>
                        <TableCell>
                          {t.submission ? (
                            <Badge variant={t.submission.screeningStatus === ScreeningStatus.ADVANCE ? "success" : t.submission.screeningStatus === ScreeningStatus.NOT_ADVANCING ? "destructive" : "muted"}>
                              {SCREENING_LABEL[t.submission.screeningStatus]}
                            </Badge>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {formatDate(t.createdAt)}
                        </TableCell>
                        {canWriteTeams ? (
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {t.paymentStatus !== "PAID" ? (
                                <RowMarkPaid
                                  team={{ id: t.id, code: t.code, name: t.name }}
                                  defaultAmount={String(settings.entryFee)}
                                />
                              ) : !t.ticketSentAt ? (
                                <RowSendTicket
                                  team={{ id: t.id, code: t.code, name: t.name }}
                                />
                              ) : null}
                              <RowDeleteButton
                                team={{ id: t.id, code: t.code, name: t.name }}
                                memberCount={t._count.participants}
                                blockers={[
                                  ...(t._count.checkpoints > 0
                                    ? [`${t._count.checkpoints} checkpoint log(s)`]
                                    : []),
                                  ...(t._count.scores > 0
                                    ? [`${t._count.scores} recorded score(s)`]
                                    : []),
                                  ...(t.submission ? ["a submitted project"] : []),
                                ]}
                              />
                            </div>
                          </TableCell>
                        ) : null}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {pages > 1 ? (
                <div className="flex items-center justify-between border-t px-4 py-3 text-sm">
                  <span className="text-muted-foreground">
                    Page {page} of {pages} · {formatNumber(total)} teams
                  </span>
                  <div className="flex gap-2">
                    <Button asChild variant="outline" size="sm">
                      <a
                        href={pageHref(page - 1)}
                        aria-disabled={page <= 1}
                        className={page <= 1 ? "pointer-events-none opacity-50" : ""}
                      >
                        <ChevronLeft className="size-4" /> Previous
                      </a>
                    </Button>
                    <Button asChild variant="outline" size="sm">
                      <a
                        href={pageHref(page + 1)}
                        aria-disabled={page >= pages}
                        className={page >= pages ? "pointer-events-none opacity-50" : ""}
                      >
                        Next <ChevronRight className="size-4" />
                      </a>
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          )}
        </CardContent>
      </Card>

      {!canEdit ? (
        <p className="mt-4 text-xs text-muted-foreground">
          You have read-only access to registrations. Status and track changes are
          restricted to the core team.
        </p>
      ) : null}
    </div>
  );
}
