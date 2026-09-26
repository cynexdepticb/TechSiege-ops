import type { Metadata } from "next";
import { requireModule, requireActor } from "@/lib/guards";
import { canWrite } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader, EmptyState } from "@/components/ui/fields";
import { StatCard, MeterBar } from "@/components/charts/stat-card";
import { PanelMemberEditor, VolunteerEditor } from "@/components/panel/panel-editors";
import { AssignmentEditor, UnassignButton } from "@/components/panel/assignment-editor";
import { formatNumber, initials } from "@/lib/utils";
import { SHIFT_LABEL, STATION_LABEL } from "@/lib/authz-lite";
import { BadgeCheck, CalendarCheck, IdCard, UserRoundCheck } from "lucide-react";
import { PanelKind } from "@/generated/prisma/enums";

export const metadata: Metadata = { title: "Panel & volunteers" };
export const dynamic = "force-dynamic";

export default async function PanelPage() {
  const actor = await requireActor();
  await requireModule("panel");
  const canEdit = canWrite(actor, "panel");

  const [judges, mentors, volunteers, teams, assignments] = await Promise.all([
    prisma.panelMember.findMany({
      where: { kind: "JUDGE" },
      orderBy: { name: "asc" },
      select: {
        id: true,
        kind: true,
        name: true,
        email: true,
        org: true,
        title: true,
        phone: true,
        bio: true,
        confirmed: true,
        active: true,
        userId: true,
        _count: { select: { scores: true, assignments: true } },
      },
    }),
    prisma.panelMember.findMany({
      where: { kind: "MENTOR" },
      orderBy: { name: "asc" },
      select: {
        id: true,
        kind: true,
        name: true,
        email: true,
        org: true,
        title: true,
        phone: true,
        bio: true,
        confirmed: true,
        active: true,
        userId: true,
        _count: { select: { scores: true, assignments: true } },
      },
    }),
    prisma.volunteer.findMany({
      orderBy: [{ station: "asc" }, { name: "asc" }],
      select: { id: true, name: true, email: true, phone: true, shift: true, station: true },
    }),
    prisma.team.findMany({
      orderBy: { code: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        status: true,
        track: { select: { name: true } },
        _count: { select: { assignments: true } },
      },
    }),
    prisma.assignment.findMany({
      where: { teamId: { not: null } },
      select: { id: true, panelId: true, teamId: true, team: { select: { code: true, name: true } } },
    }),
  ]);

  const panel = [...judges, ...mentors];
  const confirmed = panel.filter((p) => p.confirmed).length;
  const unconfirmed = panel.length - confirmed;
  const stations = new Set(volunteers.map((v) => v.station)).size;
  const noContact = volunteers.filter((v) => !v.email && !v.phone).length;
  const withLogin = panel.filter((p) => p.userId).length;
  const unassignedTeams = teams.filter((t) => t._count.assignments === 0).length;

  const byPanel = new Map<string, { id: string; teamId: string; code: string; name: string }[]>();
  for (const a of assignments) {
    if (!a.teamId || !a.team) continue;
    const list = byPanel.get(a.panelId) ?? [];
    list.push({ id: a.id, teamId: a.teamId, code: a.team.code, name: a.team.name });
    byPanel.set(a.panelId, list);
  }

  const assignable = teams.map((t) => ({
    id: t.id,
    code: t.code,
    name: t.name,
    trackName: t.track?.name ?? null,
    status: t.status,
    assignedElsewhere: t._count.assignments,
  }));

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Panel & volunteers"
        description="Judge and mentor roster with RSVP and workload, plus the volunteer shift plan."
      />

      <div className="mb-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Panel"
          value={formatNumber(panel.length)}
          hint={`${judges.length} judges · ${mentors.length} mentors`}
        />
        <StatCard
          label="Confirmed for event day"
          value={formatNumber(confirmed)}
          hint={unconfirmed > 0 ? `${unconfirmed} awaiting RSVP` : "everyone confirmed"}
          tone={unconfirmed > 0 ? "warning" : "success"}
        />
        <StatCard
          label="Volunteers"
          value={formatNumber(volunteers.length)}
          hint={`across ${stations} ${stations === 1 ? "station" : "stations"}`}
        />
        <StatCard
          label="Volunteers with no contact"
          value={formatNumber(noContact)}
          hint={noContact > 0 ? "chase these" : "all reachable"}
          tone={noContact > 0 ? "destructive" : "default"}
        />
      </div>

      {canEdit ? (
        <div className="mb-4 flex flex-wrap justify-end gap-2">
          <PanelMemberEditor />
          <VolunteerEditor />
        </div>
      ) : null}

      {canEdit && panel.length > 0 && teams.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
          <Badge variant={unassignedTeams > 0 ? "warning" : "success"}>
            {formatNumber(assignments.length)} assignments
          </Badge>
          <span className="text-muted-foreground">
            {unassignedTeams > 0
              ? `${unassignedTeams} of ${teams.length} teams have nobody assigned.`
              : `All ${teams.length} teams have at least one panel member.`}
          </span>
          <span className="text-muted-foreground">
            {withLogin} of {panel.length} have a portal login.
          </span>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <PanelCard
          title="Judges"
          icon={<GavelIcon />}
          description="Score teams from the judging portal."
          people={judges.map((j) => ({
            id: j.id,
            kind: j.kind,
            name: j.name,
            email: j.email,
            org: j.org,
            title: j.title,
            phone: j.phone,
            bio: j.bio,
            confirmed: j.confirmed,
            active: j.active,
            hasLogin: Boolean(j.userId),
            workload: j._count.scores,
            workloadLabel: j._count.scores === 1 ? "score" : "scores",
            assigned: byPanel.get(j.id) ?? [],
          }))}
          teams={assignable}
          canEdit={canEdit}
        />

        <PanelCard
          title="Mentors"
          icon={<UserRoundCheck className="size-4" />}
          description="Checkpoint feedback for assigned teams."
          people={mentors.map((m) => ({
            id: m.id,
            kind: m.kind,
            name: m.name,
            email: m.email,
            org: m.org,
            title: m.title,
            phone: m.phone,
            bio: m.bio,
            confirmed: m.confirmed,
            active: m.active,
            hasLogin: Boolean(m.userId),
            workload: m._count.assignments,
            workloadLabel: m._count.assignments === 1 ? "team" : "teams",
            assigned: byPanel.get(m.id) ?? [],
          }))}
          teams={assignable}
          canEdit={canEdit}
        />

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <IdCard className="size-4" /> Volunteers
            </CardTitle>
            <CardDescription>
              Shift and station plan for event day. Volunteers can sign in with the check-in
              scanner only.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {volunteers.length === 0 ? (
              <EmptyState
                title="No volunteers"
                description="Add volunteers to staff the desks. Check-in logins are created from Settings."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="px-4 py-2 font-medium">Name</th>
                      <th className="px-2 py-2 font-medium">Station</th>
                      <th className="px-2 py-2 font-medium">Shift</th>
                      <th className="px-2 py-2 font-medium">Contact</th>
                      {canEdit ? <th className="w-10 px-2 py-2" /> : null}
                    </tr>
                  </thead>
                  <tbody>
                    {volunteers.map((v) => (
                      <tr key={v.id} className="border-b last:border-0">
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                              {initials(v.name)}
                            </span>
                            <span className="font-medium">{v.name}</span>
                          </div>
                        </td>
                        <td className="px-2 py-2">
                          <Badge variant="outline">{STATION_LABEL[v.station]}</Badge>
                        </td>
                        <td className="px-2 py-2">
                          <Badge
                            variant={
                              v.shift === "NIGHT"
                                ? "secondary"
                                : v.shift === "FULL_DAY"
                                  ? "default"
                                  : "muted"
                            }
                          >
                            {SHIFT_LABEL[v.shift]}
                          </Badge>
                        </td>
                        <td className="px-2 py-2 text-muted-foreground">
                          {v.email ?? v.phone ?? "—"}
                        </td>
                        {canEdit ? (
                          <td className="px-2 py-2 text-right">
                            <VolunteerEditor
                              volunteer={{
                                id: v.id,
                                name: v.name,
                                email: v.email ?? "",
                                phone: v.phone ?? "",
                                shift: v.shift,
                                station: v.station,
                              }}
                            />
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function GavelIcon() {
  return <BadgeCheck className="size-4" />;
}

type Person = {
  id: string;
  kind: PanelKind;
  name: string;
  email: string;
  org: string | null;
  title: string | null;
  phone: string | null;
  bio: string | null;
  confirmed: boolean;
  active: boolean;
  hasLogin: boolean;
  workload: number;
  workloadLabel: string;
  assigned: { id: string; teamId: string; code: string; name: string }[];
};

function PanelCard({
  title,
  icon,
  description,
  people,
  teams,
  canEdit,
}: {
  title: string;
  icon: React.ReactNode;
  description: string;
  people: Person[];
  teams: { id: string; code: string; name: string; trackName: string | null; status: string; assignedElsewhere: number }[];
  canEdit: boolean;
}) {
  const busiest = Math.max(...people.map((p) => p.workload), 1);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {icon} {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {people.length === 0 ? (
          <EmptyState
            title={`No ${title.toLowerCase()} yet`}
            description={
              canEdit
                ? `Add one above, then give them a portal login from Settings.`
                : "Nobody on the panel yet."
            }
          />
        ) : (
          <ul className="divide-y">
            {people.map((p) => (
              <li key={p.id} className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium">
                      {initials(p.name)}
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-medium">{p.name}</span>
                        {!p.active ? <Badge variant="muted">Inactive</Badge> : null}
                        {p.hasLogin ? (
                          <Badge variant="success">Portal login</Badge>
                        ) : (
                          <Badge variant="outline">No login</Badge>
                        )}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {[p.title, p.org].filter(Boolean).join(" · ") || "—"}
                        {p.phone ? ` · ${p.phone}` : ""}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Badge variant={p.confirmed ? "success" : "warning"}>
                      {p.confirmed ? (
                        <>
                          <CalendarCheck className="size-3" /> Confirmed
                        </>
                      ) : (
                        "Awaiting RSVP"
                      )}
                    </Badge>
                    {canEdit ? (
                      <>
                        <AssignmentEditor
                          memberId={p.id}
                          memberName={p.name}
                          kind={p.kind}
                          assigned={p.assigned}
                          teams={teams}
                        />
                        <PanelMemberEditor
                          member={{
                            id: p.id,
                            kind: p.kind,
                            name: p.name,
                            email: p.email,
                            org: p.org ?? "",
                            title: p.title ?? "",
                            phone: p.phone ?? "",
                            bio: p.bio ?? "",
                            confirmed: p.confirmed,
                            active: p.active,
                          }}
                        />
                      </>
                    ) : null}
                  </div>
                </div>

                <div className="mt-2 pl-10">
                  <MeterBar
                    label={p.workload === 0 ? "nothing recorded yet" : `${p.workload} ${p.workloadLabel}`}
                    value={p.workload}
                    max={busiest}
                    tone={p.workload >= busiest ? "warning" : "primary"}
                  />
                </div>

                {p.assigned.length > 0 ? (
                  <details className="mt-2 pl-10 text-sm">
                    <summary className="cursor-pointer text-muted-foreground">
                      Assigned teams ({p.assigned.length})
                    </summary>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {p.assigned.map((a) =>
                        canEdit ? (
                          <UnassignButton key={a.id} assignmentId={a.id} teamCode={a.code} />
                        ) : (
                          <Badge key={a.id} variant="outline" className="font-mono">
                            {a.code}
                          </Badge>
                        ),
                      )}
                    </div>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
