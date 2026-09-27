/**
 * Marketing track id → ops track slug.
 *
 * The two systems name the same six tracks differently: the public site uses
 * short ids (`autonomous`) while ops uses slugs (`autonomous-ai`). This mapping
 * used to live inside scripts/sync-registrations.ts, which meant the live
 * registration path could not resolve a track at all — every marketing
 * registration had to wait for a manual import to land anywhere useful.
 *
 * Kept as plain data with no `server-only` import so the sync script and the API
 * route can both read it. Both sides verify it against the database at runtime
 * rather than trusting it: an unmapped id is a hard error, never a silent skip,
 * because a team dropped without explanation is worse than a failed request.
 */
export const TRACK_MAP: Record<string, string> = {
  autonomous: "autonomous-ai",
  education: "ai-for-education",
  healthcare: "ai-for-healthcare",
  finance: "ai-for-finance",
  social: "ai-for-social-impact",
  devagents: "ai-developer-agents",
};

/** Resolves a marketing track id to an ops slug, or null when unmapped. */
export function opsSlugForMarketingTrack(marketingId: string): string | null {
  return TRACK_MAP[marketingId] ?? null;
}
