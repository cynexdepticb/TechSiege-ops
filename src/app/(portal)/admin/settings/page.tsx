import type { Metadata } from "next";
import { requireActor, requireModule } from "@/lib/guards";
import { isSuperAdmin } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { getSettings } from "@/lib/settings";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { PageHeader, EmptyState } from "@/components/ui/fields";
import { SettingsForm } from "@/components/settings/settings-form";
import { StaffManager } from "@/components/settings/staff-manager";
import { formatDateTime, formatNumber, relativeTime } from "@/lib/utils";

import { Settings } from "lucide-react";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const actor = await requireActor();
  // Settings are super-admin only, so double-check even though the nav hides it.
  await requireModule("settings");
  const superAdmin = isSuperAdmin(actor);

  const [settings, staff, auditLog, panelMembers, volunteers] = await Promise.all([
    getSettings(),
    superAdmin
      ? prisma.user.findMany({
          orderBy: [{ role: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            vertical: true,
            active: true,
            createdAt: true,
            lastLoginAt: true,
          },
        })
      : Promise.resolve([]),
    superAdmin
      ? prisma.auditLog.findMany({
          orderBy: { createdAt: "desc" },
          take: 25,
          select: {
            id: true,
            action: true,
            entityType: true,
            entityId: true,
            actorEmail: true,
            createdAt: true,
          },
        })
      : Promise.resolve([]),
    // Roster rows a portal login can be attached to. Without one of these a
    // judge or mentor account signs in and finds an empty portal.
    superAdmin
      ? prisma.panelMember.findMany({
          orderBy: { name: "asc" },
          select: { id: true, kind: true, name: true, email: true, userId: true },
        })
      : Promise.resolve([]),
    superAdmin
      ? prisma.volunteer.findMany({
          orderBy: { name: "asc" },
          select: { id: true, name: true, userId: true },
        })
      : Promise.resolve([]),
  ]);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Settings"
        description="Event configuration, staff accounts, and the audit trail. Super admin only."
      />

      {!superAdmin ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            You can view settings but not change them. Ask a super admin for edits.
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-1">
          <SettingsForm
            settings={{
              eventName: settings.eventName,
              submissionDeadline: settings.submissionDeadline,
              registrationOpen: settings.registrationOpen,
              maxTeams: settings.maxTeams,
            }}
            canEdit={superAdmin}
          />
        </div>

        <div className="space-y-4 lg:col-span-2">
          {superAdmin ? (
            <StaffManager
              staff={staff.map((s) => ({
                id: s.id,
                name: s.name,
                email: s.email,
                role: s.role,
                vertical: s.vertical,
                active: s.active,
                lastLoginAt: s.lastLoginAt ? s.lastLoginAt.toISOString() : null,
                linkedPanelName:
                  panelMembers.find((p) => p.userId === s.id)?.name ?? null,
                linkedVolunteerName:
                  volunteers.find((v) => v.userId === s.id)?.name ?? null,
              }))}
              panelMembers={panelMembers.map((p) => ({
                id: p.id,
                kind: p.kind,
                name: p.name,
                email: p.email,
                taken: Boolean(p.userId),
              }))}
              volunteers={volunteers.map((v) => ({
                id: v.id,
                name: v.name,
                taken: Boolean(v.userId),
              }))}
              selfId={actor.id}
            />
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="size-4" /> Audit trail
              </CardTitle>
              <CardDescription>
                The last {formatNumber(auditLog.length)} recorded changes
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {auditLog.length === 0 ? (
                <EmptyState
                  title="Nothing logged yet"
                  description="Changes to teams, scores, sponsors and templates are recorded here."
                />
              ) : (
                <ul className="divide-y text-sm">
                  {auditLog.map((a) => (
                    <li key={a.id} className="flex items-baseline justify-between gap-3 px-4 py-2">
                      <div className="min-w-0">
                        <span className="font-mono text-xs">{a.action}</span>
                        <span className="ml-2 text-xs text-muted-foreground">
                          {a.entityType}
                        </span>
                        <div className="truncate text-xs text-muted-foreground">
                          {a.actorEmail || "system"}
                        </div>
                      </div>
                      <span
                        className="shrink-0 text-xs text-muted-foreground"
                        title={formatDateTime(a.createdAt)}
                      >
                        {relativeTime(a.createdAt)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
