import "server-only";
import { prisma } from "@/lib/prisma";
import { CRITERIA, CHECKPOINTS } from "@/lib/site";
import { getSettings } from "@/lib/settings";
import type { CheckpointName, CommStatus, TeamStatus } from "@/generated/prisma/enums";

/* ───────────────────────── registration funnel ────────────────────── */

export type Funnel = {
  visits: number;
  started: number;
  completed: number;
  confirmed: number;
  /** visits -> started -> completed -> confirmed, as percentages of visits. */
  steps: { label: string; value: number; pct: number }[];
};

export async function getFunnel(): Promise<Funnel> {
  const [visits, started, completed, confirmed] = await Promise.all([
    prisma.analyticsEvent.count({ where: { type: "PAGE_VIEW" } }),
    prisma.analyticsEvent.count({ where: { type: "FORM_START" } }),
    prisma.analyticsEvent.count({ where: { type: "FORM_COMPLETE" } }),
    prisma.team.count({ where: { status: { in: ["CONFIRMED", "CHECKED_IN", "SUBMITTED"] } } }),
  ]);

  const base = Math.max(visits, 1);
  return {
    visits,
    started,
    completed,
    confirmed,
    steps: [
      { label: "Visited registration", value: visits, pct: 100 },
      { label: "Started the form", value: started, pct: Math.round((started / base) * 100) },
      { label: "Submitted", value: completed, pct: Math.round((completed / base) * 100) },
      { label: "Confirmed", value: confirmed, pct: Math.round((confirmed / base) * 100) },
    ],
  };
}

/* ────────────────────────── registrations over time ────────────────── */

export type DailyPoint = { date: string; label: string; teams: number; cumulative: number };

export async function getDailyRegistrations(days = 30): Promise<DailyPoint[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  const rows = await prisma.team.findMany({
    where: { createdAt: { gte: since } },
    select: { createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  const byDay = new Map<string, number>();
  for (const r of rows) {
    const key = r.createdAt.toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }

  // Fill gaps so the chart shows a continuous window.
  const out: DailyPoint[] = [];
  let cumulative = 0;
  for (let i = 0; i <= days; i++) {
    const d = new Date(since);
    d.setDate(since.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    const teams = byDay.get(key) ?? 0;
    cumulative += teams;
    out.push({
      date: key,
      label: new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(d),
      teams,
      cumulative,
    });
  }
  return out;
}

/* ─────────────────────────── track distribution ────────────────────── */

export type TrackStat = {
  id: string;
  name: string;
  teams: number;
  capacity: number | null;
  fillPct: number;
  confirmed: number;
};

export async function getTrackStats(): Promise<TrackStat[]> {
  const tracks = await prisma.track.findMany({
    orderBy: { sortOrder: "asc" },
    include: {
      _count: { select: { teams: true } },
      teams: { select: { status: true } },
    },
  });

  return tracks.map((t) => {
    const teams = t._count.teams;
    const confirmed = t.teams.filter((x) => x.status !== "PENDING" && x.status !== "DISQUALIFIED").length;
    return {
      id: t.id,
      name: t.name,
      teams,
      capacity: t.capacity,
      fillPct: t.capacity ? Math.min(100, Math.round((teams / t.capacity) * 100)) : 0,
      confirmed,
    };
  });
}

/* ────────────────────────── geographic + size mix ──────────────────── */

export type CollegeStat = { college: string; city: string; teams: number };
export type SizeStat = { size: number; teams: number };

/*
 * NOTE: these two use the Prisma query API rather than $queryRaw on purpose.
 * The `pg` driver adapter only applies our `ops` schema to ORM-generated
 * statements — hand-written raw SQL resolves against the connection's
 * search_path, which Neon leaves at "$user", public. And Neon rejects
 * search_path as a startup parameter, so it can't be set in the URL either.
 * Going through the query API keeps the schema qualification automatic.
 */

export async function getGeography(limit = 10): Promise<CollegeStat[]> {
  const groups = await prisma.team.groupBy({
    by: ["college", "city"],
    _count: { _all: true },
  });

  return groups
    .map((g) => ({
      college: g.college,
      city: g.city || "—",
      teams: g._count._all,
    }))
    .sort((a, b) => b.teams - a.teams || a.college.localeCompare(b.college))
    .slice(0, limit);
}

export async function getTeamSizeMix(): Promise<SizeStat[]> {
  // `groupBy` can't count a relation, so select the count per team and
  // tally in memory — team counts are small enough that this is cheaper
  // than fighting the query builder.
  const teams = await prisma.team.findMany({
    select: { id: true, _count: { select: { participants: true } } },
  });

  const tally = new Map<number, number>();
  for (const t of teams) {
    const size = t._count.participants;
    tally.set(size, (tally.get(size) ?? 0) + 1);
  }

  return [...tally.entries()]
    .map(([size, teams]) => ({ size, teams }))
    .sort((a, b) => a.size - b.size);
}

/* ──────────────────────────── status mix ───────────────────────────── */

export async function getStatusMix(): Promise<{ status: TeamStatus; count: number }[]> {
  const rows = await prisma.team.groupBy({ by: ["status"], _count: { _all: true } });
  return rows.map((r) => ({ status: r.status, count: r._count._all }));
}

/* ─────────────────────── communication delivery ────────────────────── */

export type DeliveryStats = {
  totals: Record<CommStatus | "ALL", number>;
  byType: { type: string; sent: number; failed: number; opened: number }[];
  openRate: number;
  failureRate: number;
};

export async function getDeliveryStats(): Promise<DeliveryStats> {
  const [grouped, byTypeRows] = await Promise.all([
    prisma.communicationLog.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.communicationLog.groupBy({ by: ["type", "status"], _count: { _all: true } }),
  ]);

  const totals = { ALL: 0, QUEUED: 0, SENT: 0, DELIVERED: 0, OPENED: 0, FAILED: 0, BOUNCED: 0 } as DeliveryStats["totals"];
  for (const g of grouped) {
    const n = g._count._all;
    totals[g.status] = n;
    totals.ALL += n;
  }

  const typeMap = new Map<string, { type: string; sent: number; failed: number; opened: number }>();
  for (const row of byTypeRows) {
    const entry = typeMap.get(row.type) ?? { type: row.type, sent: 0, failed: 0, opened: 0 };
    const n = row._count._all;
    if (row.status === "FAILED" || row.status === "BOUNCED") entry.failed += n;
    else if (row.status === "OPENED") {
      entry.opened += n;
      entry.sent += n;
    } else if (row.status === "SENT" || row.status === "DELIVERED") entry.sent += n;
    typeMap.set(row.type, entry);
  }

  const delivered = totals.SENT + totals.DELIVERED + totals.OPENED;
  return {
    totals,
    byType: [...typeMap.values()].sort((a, b) => b.sent - a.sent),
    openRate: delivered ? Math.round((totals.OPENED / delivered) * 100) : 0,
    failureRate: delivered ? Math.round(((totals.FAILED + totals.BOUNCED) / delivered) * 100) : 0,
  };
}

/* ─────────────────────────── event-day live ────────────────────────── */

export type LiveStats = {
  registered: number;
  checkedIn: number;
  checkInPct: number;
  submissionsExpected: number;
  submissionsReceived: number;
  submissionPct: number;
  deadline: string;
  deadlinePassed: boolean;
  checkpoints: { key: CheckpointName; label: string; done: number; pct: number }[];
};

export async function getLiveStats(): Promise<LiveStats> {
  const { submissionDeadline } = await getSettings();
  const [registered, checkedIn, submissionsExpected, submissionsReceived, checkpointRows] = await Promise.all([
    prisma.team.count({ where: { status: { not: "DISQUALIFIED" } } }),
    prisma.team.count({ where: { status: { in: ["CHECKED_IN", "SUBMITTED"] } } }),
    prisma.team.count({ where: { status: { in: ["CHECKED_IN", "SUBMITTED"] } } }),
    prisma.submission.count(),
    prisma.checkpointLog.groupBy({ by: ["checkpoint"], _count: { _all: true } }),
  ]);

  const done = new Map(checkpointRows.map((r) => [r.checkpoint, r._count._all]));
  // Check-in denominator is the confirmed cohort, not the raw cap.
  const checkedInCohort = Math.max(checkedIn, 1);

  return {
    registered,
    checkedIn,
    checkInPct: Math.round((checkedIn / Math.max(registered, 1)) * 100),
    submissionsExpected: submissionsExpected,
    submissionsReceived,
    submissionPct: Math.round((submissionsReceived / Math.max(submissionsExpected, 1)) * 100),
    deadline: submissionDeadline,
    deadlinePassed: new Date(submissionDeadline).getTime() <= Date.now(),
    checkpoints: CHECKPOINTS.map((c) => ({
      key: c.key as CheckpointName,
      label: c.short,
      done: done.get(c.key as CheckpointName) ?? 0,
      pct: Math.round(((done.get(c.key as CheckpointName) ?? 0) / checkedInCohort) * 100),
    })),
  };
}

/* ────────────────────────────── sponsor ────────────────────────────── */

export type SponsorStats = {
  byTier: { tier: string; leads: number; confirmed: number; value: number }[];
  totalPipeline: number;
  totalCommitted: number;
  totalReceived: number;
  openLeads: number;
};

export async function getSponsorStats(): Promise<SponsorStats> {
  const rows = await prisma.sponsor.findMany({ select: { tier: true, status: true, amount: true } });
  const byTierMap = new Map<string, { tier: string; leads: number; confirmed: number; value: number }>();
  let totalPipeline = 0;
  let totalCommitted = 0;
  let totalReceived = 0;
  let openLeads = 0;

  for (const r of rows) {
    const amount = r.amount ? Number(r.amount) : 0;
    const entry = byTierMap.get(r.tier) ?? { tier: r.tier, leads: 0, confirmed: 0, value: 0 };
    if (r.status === "LEAD" || r.status === "CONTACTED") {
      entry.leads += 1;
      openLeads += 1;
      totalPipeline += amount;
    } else {
      entry.confirmed += 1;
      entry.value += amount;
      if (r.status === "PAID") totalReceived += amount;
      else totalCommitted += amount;
    }
    byTierMap.set(r.tier, entry);
  }

  return { byTier: [...byTierMap.values()], totalPipeline, totalCommitted, totalReceived, openLeads };
}

/* ────────────────────────────── headline ───────────────────────────── */

export async function getHeadline() {
  const [totalTeams, totalMembers, colleges, live, funnel] = await Promise.all([
    prisma.team.count(),
    prisma.participant.count(),
    prisma.team.groupBy({ by: ["college"], _count: { _all: true } }),
    getLiveStats(),
    getFunnel(),
  ]);
  return {
    totalTeams,
    totalMembers,
    totalColleges: colleges.length,
    live,
    funnel,
  };
}

/** Rubric weights live in lib/site.ts — re-exported for the scoring UI. */
export { CRITERIA };
