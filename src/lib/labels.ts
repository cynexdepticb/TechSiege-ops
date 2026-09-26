/**
 * Display labels for enums that have no home in authz-lite. Client-safe: no
 * `server-only`, no database import.
 */

export const SCREENING_LABEL = {
  PENDING: "Pending review",
  ADVANCE: "Advances",
  NOT_ADVANCING: "Does not advance",
} as const;

export const SCREENING_VARIANT = {
  PENDING: "muted",
  ADVANCE: "success",
  NOT_ADVANCING: "destructive",
} as const;

export const COMM_STATUS_VARIANT = {
  QUEUED: "muted",
  SENT: "outline",
  DELIVERED: "default",
  OPENED: "success",
  FAILED: "destructive",
  BOUNCED: "destructive",
} as const;

/** RAG status used by the checkpoint board. */
export const RAG = {
  GREEN: { label: "On track", variant: "success", dot: "bg-emerald-400" },
  AMBER: { label: "At risk", variant: "warning", dot: "bg-amber-400" },
  RED: { label: "Needs action", variant: "destructive", dot: "bg-red-400" },
} as const;

export type RagKey = keyof typeof RAG;
