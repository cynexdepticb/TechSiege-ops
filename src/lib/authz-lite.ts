/**
 * Role/vertical labels without pulling in `server-only`, so client components
 * (the sidebar) can import them. Keep in sync with lib/authz.ts.
 */

export const ROLE_LABEL = {
  SUPER_ADMIN: "Super admin",
  TEAM_LEAD: "Team lead",
  VOLUNTEER: "Volunteer",
  JUDGE: "Judge",
  MENTOR: "Mentor",
} as const;

export const VERTICAL_LABEL = {
  SPONSORSHIP: "Sponsorship",
  MARKETING: "Marketing",
  TECHNICAL: "Technical",
  PROBLEM_STATEMENTS: "Problem statements",
  MENTOR_JUDGE_RELATIONS: "Mentor & judge relations",
  LOGISTICS: "Logistics",
  MEDIA: "Media",
  VOLUNTEER_SUPPORT: "Volunteer support",
} as const;

export const TEAM_STATUS_LABEL = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  CHECKED_IN: "Checked in",
  DISQUALIFIED: "Disqualified",
  SUBMITTED: "Submitted",
} as const;

export const TEAM_STATUS_VARIANT = {
  PENDING: "muted",
  CONFIRMED: "default",
  CHECKED_IN: "success",
  DISQUALIFIED: "destructive",
  SUBMITTED: "secondary",
} as const;

export const SPONSOR_STATUS_LABEL = {
  LEAD: "Lead",
  CONTACTED: "Contacted",
  NEGOTIATING: "Negotiating",
  CONFIRMED: "Confirmed",
  PAID: "Paid",
} as const;

export const SPONSOR_STATUS_VARIANT = {
  LEAD: "muted",
  CONTACTED: "outline",
  NEGOTIATING: "warning",
  CONFIRMED: "default",
  PAID: "success",
} as const;

export const SPONSOR_TIER_LABEL = {
  TITLE: "Title",
  GOLD: "Gold",
  SILVER: "Silver",
  BRONZE: "Bronze",
  TECHNOLOGY_PARTNER: "Technology partner",
  PRIZE_IN_KIND: "Prize / in-kind",
} as const;

export const CHECKPOINT_LABEL = {
  REGISTRATION: "Registration",
  ROUND_1: "Round 1",
  ROUND_2: "Round 2",
  MIDNIGHT: "Midnight",
  SUBMISSION: "Submission",
} as const;

export const COMM_TYPE_LABEL = {
  CONFIRMATION: "Registration confirmation",
  APPROVAL: "Approval confirmation",
  WORKSHOP_REMINDER: "Workshop reminder",
  PRE_EVENT_CHECKLIST: "Pre-event checklist",
  CHECKPOINT_REMINDER: "Checkpoint reminder",
  FINALIST_ANNOUNCEMENT: "Finalist announcement",
  RESULTS_CERTIFICATE: "Results & certificate",
  PAYMENT_ACKNOWLEDGEMENT: "Payment acknowledgement",
  TICKET_ISSUED: "Ticket & check-in QR",
  CUSTOM: "Custom",
} as const;

export const COMM_STATUS_LABEL = {
  QUEUED: "Queued",
  SENT: "Sent",
  DELIVERED: "Delivered",
  OPENED: "Opened",
  FAILED: "Failed",
  BOUNCED: "Bounced",
} as const;

export const STATION_LABEL = {
  REGISTRATION_DESK: "Registration desk",
  MENTOR_DESK: "Mentor desk",
  SUBMISSION_DESK: "Submission desk",
  HELP_DESK: "Help desk",
} as const;

export const SHIFT_LABEL = {
  MORNING: "Morning",
  AFTERNOON: "Afternoon",
  NIGHT: "Night",
  FULL_DAY: "Full day",
} as const;
