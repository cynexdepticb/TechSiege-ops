import type { Metadata } from "next";
import { Suspense } from "react";
import { requireActor } from "@/lib/guards";
import {
  getDailyRegistrations,
  getDeliveryStats,
  getFunnel,
  getGeography,
  getHeadline,
  getSponsorStats,
  getTeamSizeMix,
  getTrackStats,
} from "@/lib/analytics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MeterBar, StatCard } from "@/components/charts/stat-card";
import {
  DailySignupsChart,
  DeliveryChart,
  TeamSizeChart,
  TrackBarChart,
  TrackDonut,
} from "@/components/charts/charts";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PageHeader } from "@/components/ui/fields";
import { formatCurrency, formatDateTime, formatNumber, pct } from "@/lib/utils";
import { TEAM_STATUS_LABEL, TEAM_STATUS_VARIANT } from "@/lib/authz-lite";

export const metadata: Metadata = { title: "Analytics" };
export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  await requireActor();

  const [headline, daily, tracks, geography, sizes, delivery, sponsors, funnel] = await Promise.all([
    getHeadline(),
    getDailyRegistrations(30),
    getTrackStats(),
    getGeography(8),
    getTeamSizeMix(),
    getDeliveryStats(),
    getSponsorStats(),
    getFunnel(),
  ]);

  const { live } = headline;
  const peak = Math.max(...daily.map((d) => d.teams), 0);
  const last7 = daily.slice(-7).reduce((s, d) => s + d.teams, 0);
  const prev7 = daily.slice(-14, -7).reduce((s, d) => s + d.teams, 0);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Analytics"
        description="Registration funnel, track mix, delivery rates and live event-day status."
      />

      {/* headline numbers */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Registered teams"
          value={headline.totalTeams}
          trend={{ value: last7 - prev7, label: "vs previous 7 days" }}
        />
        <StatCard label="Participants" value={headline.totalMembers} hint={`across ${headline.totalColleges} colleges`} />
        <StatCard
          label="Checked in"
          value={live.checkedIn}
          tone={live.checkInPct >= 80 ? "success" : live.checkInPct >= 40 ? "warning" : "default"}
          hint={`${live.checkInPct}% of ${live.registered} registered`}
        />
        <StatCard
          label="Submissions"
          value={live.submissionsReceived}
          tone={live.deadlinePassed ? "success" : "default"}
          hint={live.deadlinePassed ? "deadline passed" : `due ${formatDateTime(live.deadline)}`}
        />
      </div>

      {/* funnel */}
      <Card className="mt-4">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle>Registration funnel</CardTitle>
              <CardDescription>Visits through to a confirmed team</CardDescription>
            </div>
            <Badge variant="muted">{funnel.visits} visits</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {funnel.steps.map((step, i) => (
            <div key={step.label} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm text-muted-foreground">{step.label}</span>
                <span className="text-sm font-medium tabular-nums">{formatNumber(step.value)}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-700"
                  style={{ width: `${Math.min(100, step.pct)}%`, opacity: 1 - i * 0.18 }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground tabular-nums">{step.pct}% of visits</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* time series + track mix */}
      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Registrations over time</CardTitle>
                <CardDescription>Last 30 days · peak {peak} in a day</CardDescription>
              </div>
              <Badge variant="muted">{last7} this week</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <DailySignupsChart data={daily} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-0">
            <CardTitle>Track mix</CardTitle>
            <CardDescription>Share of registered teams</CardDescription>
          </CardHeader>
          <CardContent>
            <TrackDonut data={tracks} />
            <ul className="mt-2 space-y-1.5">
              {tracks.map((t, i) => (
                <li key={t.id} className="flex items-center gap-2 text-sm">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: ["#22d3ee", "#34d399", "#fbbf24", "#a78bfa", "#f472b6", "#60a5fa", "#fb923c"][i % 7] }}
                  />
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{t.name}</span>
                  <span className="tabular-nums">{t.teams}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle>Teams per track</CardTitle>
            <CardDescription>Against each track&rsquo;s capacity</CardDescription>
          </CardHeader>
          <CardContent>
            <TrackBarChart data={tracks} />
            <ul className="mt-4 grid gap-3 sm:grid-cols-2">
              {tracks.map((t) => (
                <li key={t.id}>
                  <MeterBar
                    label={t.name}
                    value={t.teams}
                    max={t.capacity ?? Math.max(t.teams, 1)}
                    tone={t.capacity && t.teams >= t.capacity ? "destructive" : t.fillPct > 80 ? "warning" : "primary"}
                    hint={t.capacity ? `${t.fillPct}% of capacity` : "No cap"}
                  />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle>Team size mix</CardTitle>
              <CardDescription>Members per team</CardDescription>
            </CardHeader>
            <CardContent>
              <TeamSizeChart data={sizes} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle>Status mix</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Suspense fallback={<div className="h-24" />}>
                <StatusMix />
              </Suspense>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* event day */}
      <Card className="mt-4">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Event-day readiness</CardTitle>
              <CardDescription>
                Submission deadline {formatDateTime(live.deadline)}
                {live.deadlinePassed ? " · closed" : ""}
              </CardDescription>
            </div>
            <Badge variant={live.deadlinePassed ? "success" : "default"}>
              {live.deadlinePassed ? "Deadline passed" : "Open"}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MeterBar
            label="Checked in"
            value={live.checkedIn}
            max={live.registered}
            tone={live.checkInPct >= 80 ? "success" : live.checkInPct >= 40 ? "warning" : "destructive"}
            hint={`${live.checkInPct}% of registered teams`}
          />
          <MeterBar
            label="Submissions received"
            value={live.submissionsReceived}
            max={live.submissionsExpected}
            tone={live.submissionPct >= 80 ? "success" : "primary"}
            hint={`${live.submissionsReceived} of ${live.submissionsExpected} expected`}
          />
          {live.checkpoints.map((cp) => (
            <MeterBar
              key={cp.key}
              label={`${cp.label} checkpoint`}
              value={cp.done}
              max={Math.max(live.checkedIn, 1)}
              tone={cp.pct >= 80 ? "success" : cp.pct >= 40 ? "warning" : "primary"}
            />
          ))}
        </CardContent>
      </Card>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Email delivery</CardTitle>
            <CardDescription>
              {delivery.openRate}% open rate · {delivery.failureRate}% failed
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DeliveryChart
              data={[
                { label: "Queued", value: delivery.totals.QUEUED },
                { label: "Sent", value: delivery.totals.SENT },
                { label: "Opened", value: delivery.totals.OPENED },
                { label: "Failed", value: delivery.totals.FAILED + delivery.totals.BOUNCED },
              ]}
            />
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <CardTitle>Top colleges</CardTitle>
                <CardDescription>Where teams are coming from</CardDescription>
              </div>
              <Badge variant="muted">{headline.totalColleges} total</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>College</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead className="text-right">Teams</TableHead>
                  <TableHead className="w-32 text-right">Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {geography.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                      No registrations yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  geography.map((g) => (
                    <TableRow key={`${g.college}-${g.city}`}>
                      <TableCell className="font-medium">{g.college}</TableCell>
                      <TableCell className="text-muted-foreground">{g.city}</TableCell>
                      <TableCell className="text-right tabular-nums">{g.teams}</TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {pct(g.teams, geography.reduce((s, x) => s + x.teams, 0))}%
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* sponsors */}
      <Card className="mt-4">
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle>Sponsor pipeline</CardTitle>
              <CardDescription>Committed vs still in negotiation</CardDescription>
            </div>
            <div className="flex gap-2">
              <Badge variant="success">{formatCurrency(sponsors.totalCommitted + sponsors.totalReceived)} committed</Badge>
              <Badge variant="muted">{formatCurrency(sponsors.totalPipeline)} pipeline</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {sponsors.byTier.length === 0 ? (
            <p className="text-sm text-muted-foreground">No sponsors recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tier</TableHead>
                  <TableHead className="text-right">In pipeline</TableHead>
                  <TableHead className="text-right">Confirmed</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sponsors.byTier.map((t) => (
                  <TableRow key={t.tier}>
                    <TableCell className="font-medium">{t.tier.replace(/_/g, " ").toLowerCase()}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.leads}</TableCell>
                    <TableCell className="text-right tabular-nums">{t.confirmed}</TableCell>
                    <TableCell className="text-right tabular-nums">{formatCurrency(t.value)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

/** Small client-free helper kept inline so status counts stay server-side. */
async function StatusMix() {
  const { getStatusMix } = await import("@/lib/analytics");
  const mix = await getStatusMix();
  if (mix.length === 0) return <p className="text-sm text-muted-foreground">No teams yet.</p>;
  const total = mix.reduce((s, m) => s + m.count, 0);
  return (
    <ul className="space-y-2">
      {mix.map((m) => (
        <li key={m.status} className="flex items-center gap-2 text-sm">
          <Badge variant={TEAM_STATUS_VARIANT[m.status]}>{TEAM_STATUS_LABEL[m.status]}</Badge>
          <span className="ml-auto tabular-nums">{formatNumber(m.count)}</span>
          <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
            {pct(m.count, total)}%
          </span>
        </li>
      ))}
    </ul>
  );
}
