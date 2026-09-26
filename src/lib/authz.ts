import "server-only";
import { prisma } from "@/lib/prisma";
import type { Role, Vertical } from "@/generated/prisma/enums";

/** The subset of the session this app authorises against. */
export type Actor = {
  id: string;
  email: string;
  name: string;
  role: Role;
  vertical: Vertical | null;
};

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super admin",
  TEAM_LEAD: "Team lead",
  VOLUNTEER: "Volunteer",
  JUDGE: "Judge",
  MENTOR: "Mentor",
};

export const VERTICAL_LABEL: Record<Vertical, string> = {
  SPONSORSHIP: "Sponsorship",
  MARKETING: "Marketing",
  TECHNICAL: "Technical",
  PROBLEM_STATEMENTS: "Problem statements",
  MENTOR_JUDGE_RELATIONS: "Mentor & judge relations",
  LOGISTICS: "Logistics",
  MEDIA: "Media",
  VOLUNTEER_SUPPORT: "Volunteer support",
};

/** Which vertical owns each module, so a team lead only sees their own. */
/** Cross-cutting modules. Team leads reach these regardless of vertical,
 *  since every vertical needs to see the shared operational picture. */
const SHARED: readonly string[] = [
  "analytics",
  "teams",
  "submissions",
  "judging",
  "tracks",
  "checkin",
  "comms",
  "settings",
];

/** Modules owned by exactly one vertical. */
export const MODULE_VERTICAL: Record<string, Vertical> = {
  sponsors: "SPONSORSHIP",
  marketing: "MARKETING",
  problemStatements: "PROBLEM_STATEMENTS",
  logistics: "LOGISTICS",
  media: "MEDIA",
  volunteers: "VOLUNTEER_SUPPORT",
  panel: "MENTOR_JUDGE_RELATIONS",
  technical: "TECHNICAL",
};

export function isSuperAdmin(actor: Actor): boolean {
  return actor.role === "SUPER_ADMIN";
}

/** True when the actor may open `module`. Super admins always may. */
export function canAccessModule(actor: Actor, module: string): boolean {
  if (isSuperAdmin(actor)) return true;
  if (actor.role === "TEAM_LEAD") {
    if (SHARED.includes(module)) return true;
    return actor.vertical === MODULE_VERTICAL[module];
  }
  // Volunteers are confined to check-in; judges/mentors to their own portal.
  if (actor.role === "VOLUNTEER") return module === "checkin";
  return false;
}

/** Who may change data, per module. Reads are broader than writes. */
const WRITE_ROLES: Record<string, Role[]> = {
  analytics: ["SUPER_ADMIN"],
  teams: ["SUPER_ADMIN"],
  submissions: ["SUPER_ADMIN"],
  judging: ["SUPER_ADMIN"],
  tracks: ["SUPER_ADMIN"],
  checkin: ["SUPER_ADMIN", "TEAM_LEAD", "VOLUNTEER"],
  comms: ["SUPER_ADMIN"],
  settings: ["SUPER_ADMIN"],
  sponsors: ["SUPER_ADMIN", "TEAM_LEAD"],
  panel: ["SUPER_ADMIN", "TEAM_LEAD"],
  volunteers: ["SUPER_ADMIN", "TEAM_LEAD"],
};

/** Modules any team lead may write to, whatever their vertical. Check-in is
 *  the obvious one: volunteers scan at the door all day regardless of who
 *  recruited them, and no single vertical owns the queue. */
const CROSS_VERTICAL_WRITES: readonly string[] = ["checkin"];

/** Writes are narrower than reads. A team lead may change data in the module
 *  their vertical owns, plus the shared operational ones listed above. */
export function canWrite(actor: Actor, module: string): boolean {
  if (isSuperAdmin(actor)) return true;
  if (!WRITE_ROLES[module]?.includes(actor.role)) return false;
  if (actor.role !== "TEAM_LEAD") return true;
  if (CROSS_VERTICAL_WRITES.includes(module)) return true;
  return actor.vertical === MODULE_VERTICAL[module];
}

export async function loadActor(userId: string): Promise<Actor | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true, vertical: true, active: true },
  });
  if (!user?.active) return null;
  return { id: user.id, email: user.email, name: user.name, role: user.role, vertical: user.vertical };
}
