/** Site-wide config, editable via env. Keep event facts in one place. */

export const SITE = {
  name: process.env.NEXT_PUBLIC_EVENT_NAME ?? "TechSiege",
  shortName: "TechSiege",
  venue: "AIET, Mijar Campus — Auditorium",
  city: "Mangaluru",
  supportEmail: process.env.SUPPORT_EMAIL ?? "cynex.depticb@gmail.com",
  timezone: "Asia/Kolkata",
} as const;

/**
 * Public origin of this deployment, used to build absolute links (check-in QR
 * codes, email). Falls back to localhost so local dev always works.
 */
export function siteOrigin(): string {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "NEXT_PUBLIC_SITE_URL must be set in production — check-in QR codes need an absolute origin.",
    );
  }
  return `http://localhost:${process.env.PORT ?? 3100}`;
}

/** Judging rubric — weights must sum to 1. */
export const CRITERIA = [
  { key: "agenticCapability", label: "Agentic Capability", weight: 0.25, hint: "Tool use, planning, autonomy, failure handling" },
  { key: "innovation", label: "Innovation", weight: 0.2, hint: "Originality of the approach" },
  { key: "technicalImplementation", label: "Technical Implementation", weight: 0.2, hint: "Code quality, architecture, working demo" },
  { key: "problemRelevance", label: "Problem Relevance & Clarity", weight: 0.15, hint: "Is the problem real and well framed?" },
  { key: "userExperience", label: "User Experience", weight: 0.1, hint: "Usability of the final surface" },
  { key: "demoPresentation", label: "Demo & Presentation", weight: 0.1, hint: "Clarity and delivery of the demo" },
] as const;

export type CriterionKey = (typeof CRITERIA)[number]["key"];

export const SCORE_MIN = 0;
export const SCORE_MAX = 10;

/** Event-day checkpoints, in the order they happen. */
export const CHECKPOINTS = [
  { key: "REGISTRATION", label: "Registration & check-in", short: "Check-in" },
  { key: "ROUND_1", label: "Mentor checkpoint — round 1", short: "Round 1" },
  { key: "ROUND_2", label: "Mentor checkpoint — round 2", short: "Round 2" },
  { key: "MIDNIGHT", label: "Midnight checkpoint", short: "Midnight" },
  { key: "SUBMISSION", label: "Submission deadline", short: "Submission" },
] as const;

export const TRACK_SLUGS = [
  "autonomous-ai",
  "ai-for-education",
  "ai-for-healthcare",
  "ai-for-finance",
  "ai-for-social-impact",
  "ai-developer-agents",
] as const;

export const SPONSOR_TIERS = [
  "TITLE",
  "GOLD",
  "SILVER",
  "BRONZE",
  "TECHNOLOGY_PARTNER",
  "PRIZE_IN_KIND",
] as const;

export const VERTICALS = [
  "SPONSORSHIP",
  "MARKETING",
  "TECHNICAL",
  "PROBLEM_STATEMENTS",
  "MENTOR_JUDGE_RELATIONS",
  "LOGISTICS",
  "MEDIA",
  "VOLUNTEER_SUPPORT",
] as const;
