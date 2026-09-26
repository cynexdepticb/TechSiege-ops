import type { Metadata } from "next";
import { requireModule } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { getSponsorStats } from "@/lib/analytics";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

import { PageHeader, EmptyState } from "@/components/ui/fields";
import { StatCard, MeterBar } from "@/components/charts/stat-card";
import { NewSponsor } from "@/components/sponsors/new-sponsor";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import {
  SPONSOR_STATUS_LABEL,
  SPONSOR_STATUS_VARIANT,
  SPONSOR_TIER_LABEL,
} from "@/lib/authz-lite";
import { BadgeIndianRupee, Handshake, TrendingUp, Wallet } from "lucide-react";
import { SponsorStatus, SponsorTier } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Sponsors" };
export const dynamic = "force-dynamic";

const TIER_ORDER: SponsorTier[] = [
  "TITLE",
  "GOLD",
  "SILVER",
  "BRONZE",
  "TECHNOLOGY_PARTNER",
  "PRIZE_IN_KIND",
];

export default async function SponsorsPage() {
  await requireModule("sponsors");

  const [sponsors, stats, leads] = await Promise.all([
    prisma.sponsor.findMany({
      orderBy: [{ status: "asc" }, { amount: "desc" }],
      include: { owner: { select: { name: true } } },
    }),
    getSponsorStats(),
    prisma.user.findMany({
      where: { role: { in: ["SUPER_ADMIN", "TEAM_LEAD"] }, active: true },
      select: { id: true, name: true, vertical: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const byTier = TIER_ORDER.map((tier) => {
    const rows = sponsors.filter((s) => s.tier === tier);
    return {
      tier,
      count: rows.length,
      value: rows.reduce((sum, s) => sum + Number(s.amount ?? 0), 0),
      received: rows
        .filter((s) => s.status === SponsorStatus.PAID)
        .reduce((sum, s) => sum + Number(s.amount ?? 0), 0),
    };
  }).filter((t) => t.count > 0);

  const maxTierValue = Math.max(...byTier.map((t) => t.value), 1);
  const outstanding = stats.totalCommitted + stats.totalPipeline - stats.totalReceived;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Sponsors"
        description="Pipeline by tier and status, with committed and received value."
        actions={<NewSponsor owners={leads.map((l) => ({ id: l.id, name: l.name }))} />}
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Received"
          value={formatCurrency(stats.totalReceived)}
          hint="settled invoices"
          tone="success"
        />
        <StatCard
          label="Committed"
          value={formatCurrency(stats.totalCommitted)}
          hint="confirmed but unpaid"
        />
        <StatCard
          label="Pipeline"
          value={formatCurrency(stats.totalPipeline)}
          hint={`${formatNumber(stats.openLeads)} open leads`}
        />
        <StatCard
          label="Outstanding"
          value={formatCurrency(Math.max(0, outstanding))}
          hint="still to collect"
          tone={outstanding > 0 ? "warning" : "success"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Sponsors</CardTitle>
              <CardDescription>
                {formatNumber(sponsors.length)} in the CRM
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {sponsors.length === 0 ? (
                <EmptyState
                  title="No sponsors yet"
                  description="Add leads as the sponsorship team works through the pipeline."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[44rem] text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="px-4 py-2 font-medium">Sponsor</th>
                        <th className="px-2 py-2 font-medium">Tier</th>
                        <th className="px-2 py-2 font-medium">Status</th>
                        <th className="px-2 py-2 text-right font-medium">Amount</th>
                        <th className="px-2 py-2 font-medium">Contact</th>
                        <th className="px-2 py-2 font-medium">Owner</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sponsors.map((s) => (
                        <tr key={s.id} className="border-b last:border-0">
                          <td className="px-4 py-2.5">
                            <div className="font-medium">{s.name}</div>
                            {s.notes ? (
                              <div className="max-w-[18rem] truncate text-xs text-muted-foreground">
                                {s.notes}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-2 py-2.5">
                            <Badge variant="outline">{SPONSOR_TIER_LABEL[s.tier]}</Badge>
                          </td>
                          <td className="px-2 py-2.5">
                            <Badge variant={SPONSOR_STATUS_VARIANT[s.status]}>
                              {SPONSOR_STATUS_LABEL[s.status]}
                            </Badge>
                            {s.paidAt ? (
                              <div className="mt-0.5 text-xs text-muted-foreground">
                                paid {formatDate(s.paidAt)}
                              </div>
                            ) : null}
                          </td>
                          <td className="px-2 py-2.5 text-right font-mono tabular-nums">
                            {s.amount ? formatCurrency(Number(s.amount), s.currency) : "—"}
                          </td>
                          <td className="px-2 py-2.5 text-xs text-muted-foreground">
                            {s.contactPerson || "—"}
                            {s.contactEmail ? (
                              <div className="truncate">{s.contactEmail}</div>
                            ) : null}
                          </td>
                          <td className="px-2 py-2.5 text-xs text-muted-foreground">
                            {s.owner?.name ?? "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Handshake className="size-4" /> Value by tier
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {byTier.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing to chart yet.</p>
              ) : (
                byTier.map((t) => (
                  <MeterBar
                    key={t.tier}
                    label={`${SPONSOR_TIER_LABEL[t.tier]} · ${formatNumber(t.count)}`}
                    value={t.value}
                    max={maxTierValue}
                    tone="primary"
                    hint={
                      t.received > 0
                        ? `${formatCurrency(t.received)} received`
                        : undefined
                    }
                  />
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="size-4" /> Collection progress
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Row
                icon={<Wallet className="size-4" />}
                label="Received"
                value={formatCurrency(stats.totalReceived)}
              />
              <Row
                icon={<BadgeIndianRupee className="size-4" />}
                label="Committed, unpaid"
                value={formatCurrency(stats.totalCommitted)}
              />
              <Row
                icon={<Handshake className="size-4" />}
                label="In pipeline"
                value={formatCurrency(stats.totalPipeline)}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="flex items-center gap-2 text-muted-foreground">
        {icon} {label}
      </span>
      <span className="font-mono tabular-nums">{value}</span>
    </div>
  );
}
