/** Shared copy so API routes, server actions and forms never disagree. */

export const AUTH_INVALID_MESSAGE = "Incorrect email or password.";

export const REGISTRATION = {
  MIN_TEAM_SIZE: 2,
  MAX_TEAM_SIZE: 4,
  DEFAULT_TRACK_CAPACITY: 25,
  MAX_TEAMS: 60,
} as const;

export const SETTING_KEYS = {
  submissionDeadline: "submission_deadline",
  eventName: "event_name",
  registrationOpen: "registration_open",
  maxTeams: "max_teams",
} as const;

export const DEFAULT_SETTINGS: Record<string, string> = {
  /** End of Day 2. The time is the gate the code enforces, so it must agree
   *  with the deadline time published on the marketing site's schedule. */
  [SETTING_KEYS.submissionDeadline]: "2026-10-31T10:00:00+05:30",
  [SETTING_KEYS.eventName]: "AGENTX 2026",
  [SETTING_KEYS.registrationOpen]: "true",
  [SETTING_KEYS.maxTeams]: String(REGISTRATION.MAX_TEAMS),
};
