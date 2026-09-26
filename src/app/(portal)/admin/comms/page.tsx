import type { Metadata } from "next";
import { requireModule } from "@/lib/guards";
import { prisma } from "@/lib/prisma";
import { getDeliveryStats } from "@/lib/analytics";
import { transportName } from "@/lib/email/send";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader, EmptyState } from "@/components/ui/fields";
import { StatCard } from "@/components/charts/stat-card";
import { CampaignComposer } from "@/components/comms/campaign-composer";
import { formatDateTime, formatNumber, relativeTime } from "@/lib/utils";
import { COMM_STATUS_LABEL, COMM_TYPE_LABEL } from "@/lib/authz-lite";
import { COMM_STATUS_VARIANT } from "@/lib/labels";

import Link from "next/link";

export const metadata: Metadata = { title: "Campaigns" };
export const dynamic = "force-dynamic";

export default async function CommsPage() {
  await requireModule("comms");

  const [recent, delivery, templates, tracks] = await Promise.all([
    prisma.communicationLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 40,
      select: {
        id: true,
        type: true,
        status: true,
        recipientEmail: true,
        recipientName: true,
        subject: true,
        error: true,
        createdAt: true,
        openedAt: true,
        sentAt: true,
        team: { select: { id: true, code: true, name: true } },
      },
    }),
    getDeliveryStats(),
    prisma.emailTemplate.findMany({
      where: { active: true },
      select: { key: true, name: true, type: true, subject: true },
      orderBy: { name: "asc" },
    }),
    prisma.track.findMany({
      where: { active: true },
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
  ]);

  const failedRecent = recent.filter((c) => c.status === "FAILED" || c.status === "BOUNCED").length;
  const smtpActive = transportName() === "smtp";
  const fromAddress = process.env.EMAIL_FROM ?? "AGENTX 2026 <no-reply@example.com>";
  const total = delivery.totals.ALL;
  const delivered = delivery.totals.DELIVERED + delivery.totals.OPENED;
  const failed = delivery.totals.FAILED + delivery.totals.BOUNCED;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Campaigns"
        description="Send templated email to a filtered audience, then watch delivery and open rates."
        actions={
          <Link
            href="/admin/templates"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Manage templates →
          </Link>
        }
      />

      {smtpActive ? (
        <div className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <span className="font-medium">Sending via Gmail SMTP.</span>{" "}
          <span className="text-muted-foreground">
            Mail is sent from <code className="font-mono text-xs">{fromAddress}</code>
            to the real recipient. Gmail caps an ordinary account at roughly 500
            messages a day, so move to a domain you own before a large send.
          </span>
        </div>
      ) : (
        /* No SMTP_PASSWORD, so nothing is actually leaving the machine. Rows
           still read SENT, which would otherwise look like real delivery. */
        <div className="mb-4 rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
          <span className="font-medium">Email is not being sent.</span>{" "}
          <span className="text-muted-foreground">
            <code className="font-mono text-xs">SMTP_PASSWORD</code> is empty, so
            every message is only logged to the server console. Set it to a
            16-character Google app password to deliver mail to participants.
          </span>
        </div>
      )}

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sent" value={formatNumber(total)} hint="all time" />
        <StatCard
          label="Delivered"
          value={formatNumber(delivered)}
          hint={total > 0 ? `${Math.round((delivered / total) * 100)}% of sent` : "nothing sent yet"}
          tone="success"
        />
        <StatCard
          label="Opened"
          value={formatNumber(delivery.totals.OPENED)}
          hint={`${delivery.openRate}% open rate`}
        />
        <StatCard
          label="Failed"
          value={formatNumber(failed)}
          hint={failedRecent > 0 ? `${failedRecent} in the last 40` : "no recent failures"}
          tone={failed > 0 ? "destructive" : "default"}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader>
              <CardTitle>Recent sends</CardTitle>
              <CardDescription>The last {formatNumber(recent.length)} messages</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {recent.length === 0 ? (
                <EmptyState
                  title="Nothing sent yet"
                  description="Pick a template and audience to send the first campaign."
                />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[42rem] text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="px-4 py-2 font-medium">Recipient</th>
                        <th className="px-2 py-2 font-medium">Type</th>
                        <th className="px-2 py-2 font-medium">Subject</th>
                        <th className="px-2 py-2 font-medium">Status</th>
                        <th className="px-2 py-2 font-medium">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {recent.map((c) => (
                        <tr key={c.id} className="border-b last:border-0">
                          <td className="px-4 py-2.5">
                            {c.team ? (
                              <Link
                                href={`/admin/teams/${c.team.id}`}
                                className="font-medium hover:underline"
                              >
                                {c.team.name}
                              </Link>
                            ) : (
                              <span className="font-medium">{c.recipientName || "—"}</span>
                            )}
                            <div className="truncate text-xs text-muted-foreground">
                              {c.recipientEmail}
                            </div>
                          </td>
                          <td className="px-2 py-2.5 text-xs text-muted-foreground">
                            {COMM_TYPE_LABEL[c.type]}
                          </td>
                          <td className="max-w-[14rem] truncate px-2 py-2.5 text-muted-foreground">
                            {c.subject}
                            {c.error ? (
                              <div className="text-xs text-destructive">{c.error}</div>
                            ) : null}
                          </td>
                          <td className="px-2 py-2.5">
                            <Badge variant={COMM_STATUS_VARIANT[c.status]}>
                              {COMM_STATUS_LABEL[c.status]}
                            </Badge>
                            {c.openedAt ? (
                              <div className="mt-0.5 text-xs text-muted-foreground">
                                opened {relativeTime(c.openedAt)}
                              </div>
                            ) : null}
                          </td>
                          <td
                            className="whitespace-nowrap px-2 py-2.5 text-xs text-muted-foreground"
                            title={formatDateTime(c.createdAt)}
                          >
                            {relativeTime(c.createdAt)}
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

        <CampaignComposer templates={templates} tracks={tracks} />
      </div>
    </div>
  );
}
