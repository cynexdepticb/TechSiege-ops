import type { Role } from "@/generated/prisma/enums";

export type NavItem = {
  href: string;
  label: string;
  /** lucide-react icon name, resolved by components/shell/NavIcon */
  icon: string;
  /** Roles that can see this entry at all. */
  roles: Role[];
  /** Team-lead vertical that owns it (MODULE_VERTICAL in lib/authz). */
  module?: string;
  description: string;
  /** Present on routes reachable by URL but not listed in the sidebar. */
  hidden?: boolean;
};

/** Single source of truth for the sidebar. `lib/authz.ts` enforces access. */
export const NAV: { group: string; items: NavItem[] }[] = [
  {
    group: "Overview",
    items: [
      {
        href: "/admin",
        label: "Analytics",
        icon: "ChartNoAxesCombined",
        roles: ["SUPER_ADMIN", "TEAM_LEAD"],
        description: "Registration funnel, track mix, delivery rates",
      },
      {
        href: "/admin/checkin",
        label: "Check-in",
        icon: "ScanLine",
        roles: ["SUPER_ADMIN", "TEAM_LEAD", "VOLUNTEER"],
        module: "checkin",
        description: "Live check-in and checkpoint scanning",
      },
    ],
  },
  {
    group: "Registrations",
    items: [
      {
        href: "/admin/teams",
        label: "Teams",
        icon: "Users",
        roles: ["SUPER_ADMIN", "TEAM_LEAD"],
        module: "teams",
        description: "All registered teams, filters and bulk actions",
      },
      {
        href: "/admin/submissions",
        label: "Submissions",
        icon: "Upload",
        roles: ["SUPER_ADMIN", "TEAM_LEAD"],
        module: "submissions",
        description: "Received vs expected, screening queue",
      },
    ],
  },
  {
    group: "Event day",
    items: [
      {
        href: "/admin/checkpoints",
        label: "Checkpoint board",
        icon: "ListChecks",
        roles: ["SUPER_ADMIN", "TEAM_LEAD", "VOLUNTEER"],
        module: "checkin",
        description: "RAG status across every checkpoint",
      },
      {
        href: "/admin/judging",
        label: "Judging",
        icon: "Scale",
        roles: ["SUPER_ADMIN", "TEAM_LEAD"],
        module: "judging",
        description: "Leaderboard and per-criterion breakdown",
      },
      {
        href: "/admin/panel",
        label: "Panel & volunteers",
        icon: "BadgeCheck",
        roles: ["SUPER_ADMIN", "TEAM_LEAD"],
        module: "panel",
        description: "Judge and mentor roster, shifts and stations",
      },
    ],
  },
  {
    group: "Communication",
    items: [
      {
        href: "/admin/comms",
        label: "Campaigns",
        icon: "Send",
        roles: ["SUPER_ADMIN", "TEAM_LEAD"],
        module: "comms",
        description: "Bulk sends, templates and delivery status",
      },
      {
        href: "/admin/templates",
        label: "Templates",
        icon: "FileText",
        roles: ["SUPER_ADMIN", "TEAM_LEAD"],
        module: "comms",
        description: "Subject and body with variables",
      },
    ],
  },
  {
    group: "Programme",
    items: [
      {
        href: "/admin/tracks",
        label: "Tracks",
        icon: "Compass",
        roles: ["SUPER_ADMIN", "TEAM_LEAD"],
        module: "tracks",
        description: "Track definitions and capacity",
      },
      {
        href: "/admin/sponsors",
        label: "Sponsors",
        icon: "Handshake",
        roles: ["SUPER_ADMIN", "TEAM_LEAD"],
        module: "sponsors",
        description: "Pipeline by tier and committed value",
      },
      {
        href: "/admin/settings",
        label: "Settings",
        icon: "Settings",
        roles: ["SUPER_ADMIN"],
        description: "Deadlines, capacity, staff accounts",
      },
    ],
  },
];

/** Personal portals — a different shell, not part of the admin sidebar. */
export const PORTAL_NAV: NavItem[] = [
  {
    href: "/judge",
    label: "My teams",
    icon: "Scale",
    roles: ["JUDGE"],
    description: "Score the teams assigned to you",
  },
  {
    href: "/mentor",
    label: "My teams",
    icon: "MessagesSquare",
    roles: ["MENTOR"],
    description: "Checkpoints and feedback for your teams",
  },
];

export function visibleNav(roles: Role[]): { group: string; items: NavItem[] }[] {
  return NAV.map((section) => ({
    ...section,
    items: section.items.filter(
      (item) => !("hidden" in item && item.hidden) && item.roles.some((r) => roles.includes(r)),
    ),
  })).filter((section) => section.items.length > 0);
}
