import "server-only";
import type { TemplateVars } from "@/lib/email/templates";
import { SITE } from "@/lib/site";
import { getSettings } from "@/lib/settings";

type TeamForEmail = {
  id: string;
  name: string;
  code: string;
  college: string;
  city: string;
  contactName: string;
  track: { name: string };
  _count?: { participants: number };
};

/** Builds the variable bag every template can reference. */
export async function buildVars(team: TeamForEmail, extra: TemplateVars = {}): Promise<TemplateVars> {
  const { eventName, submissionDeadline } = await getSettings();
  const firstName = team.contactName.trim().split(/\s+/)[0] || "there";

  return {
    leaderName: firstName,
    teamName: team.name,
    teamCode: team.code,
    track: team.track.name,
    college: team.college,
    city: team.city || "—",
    memberCount: team._count?.participants ?? 0,
    eventName,
    eventDate: "30–31 October 2026",
    venue: SITE.venue,
    deadline: new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: SITE.timezone,
    }).format(new Date(submissionDeadline)),
    finalSlot: 5,
    qaSlot: 3,
    ...extra,
  };
}
