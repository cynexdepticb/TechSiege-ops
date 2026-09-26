import { CRITERIA, SITE } from "@/lib/site";

/** Seeded templates. `{{var}}` placeholders are filled by renderTemplate(). */
export type TemplateSeed = {
  key: string;
  name: string;
  type: "CONFIRMATION" | "APPROVAL" | "WORKSHOP_REMINDER" | "PRE_EVENT_CHECKLIST" | "CHECKPOINT_REMINDER" | "FINALIST_ANNOUNCEMENT" | "RESULTS_CERTIFICATE";
  subject: string;
  body: string;
};

export const TEMPLATE_SEEDS: TemplateSeed[] = [
  {
    key: "registration_confirmation",
    name: "Registration confirmation",
    type: "CONFIRMATION",
    subject: "You're registered — team {{teamCode}} · {{eventName}}",
    body: `Hi {{leaderName}},

Team {{teamName}} is registered for {{eventName}} in the {{track}} track.

Team ID: {{teamCode}}
College: {{college}}
Members: {{memberCount}}
Venue: {{venue}}

Keep this email — you'll need the team ID and the QR code in it for check-in,
mentor checkpoints and submission on event day.

Next steps:
1. Attend the pre-event orientation (details in the checklist email).
2. Bring a laptop with your toolchain ready to go.
3. Your check-in QR code is attached / linked in this email.

See you on the floor,
The {{eventName}} team`,
  },
  {
    key: "approval_confirmation",
    name: "Approval confirmation",
    type: "APPROVAL",
    subject: "Team {{teamCode}} approved for {{eventName}}",
    body: `Hi {{leaderName}},

Team {{teamName}} has been approved for the {{track}} track at {{eventName}}.

Team ID: {{teamCode}}
Track: {{track}}
Members: {{memberCount}}

Check-in opens {{eventDate}} at {{venue}}. Please arrive 30 minutes early for
verification and badge collection.

— The {{eventName}} team`,
  },
  {
    key: "pre_event_checklist",
    name: "Pre-event checklist",
    type: "PRE_EVENT_CHECKLIST",
    subject: "Before you arrive — your {{eventName}} checklist",
    body: `Hi {{leaderName}},

{{eventName}} is almost here. Please confirm the following for team {{teamCode}}:

1. Every member has registered on the portal.
2. Your repository is set up and a README is committed.
3. External API keys and model access are pre-verified.
4. One laptop per member, chargers and extension leads packed.
5. A 2-3 minute demo script is drafted (you'll need it for submission).

Venue: {{venue}}
Submission deadline: {{deadline}}

— The {{eventName}} team`,
  },
  {
    key: "workshop_reminder",
    name: "Workshop reminder",
    type: "WORKSHOP_REMINDER",
    subject: "Workshop reminder — {{eventName}} track {{track}}",
    body: `Hi {{leaderName}},

A reminder that the {{track}} workshop for {{eventName}} is coming up.

Bring a laptop — we'll be building against real tools, not slides.

— The {{eventName}} team`,
  },
  {
    key: "checkpoint_reminder",
    name: "Checkpoint reminder",
    type: "CHECKPOINT_REMINDER",
    subject: "{{checkpoint}} checkpoint — team {{teamCode}}",
    body: `Hi {{leaderName}},

This is the {{checkpoint}} checkpoint for team {{teamCode}}.

A mentor will scan your QR code and review your progress. Have your repo, a
short demo and your current agent architecture ready to walk through.

Deadline: {{deadline}}

— The {{eventName}} team`,
  },
  {
    key: "finalist_announcement",
    name: "Finalist announcement",
    type: "FINALIST_ANNOUNCEMENT",
    subject: "Team {{teamCode}} advances to the final demos",
    body: `Hi {{leaderName}},

Congratulations — team {{teamName}} has advanced to the final demo round at
{{eventName}}.

You have {{finalSlot}} minutes to present and {{qaSlot}} minutes of questions.
The rubric is the same one you've seen: ${CRITERIA.map((c) => `${c.label} (${Math.round(c.weight * 100)}%)`).join(", ")}.

Good luck.

— The {{eventName}} team`,
  },
  {
    key: "results_certificate",
    name: "Results & certificate",
    type: "RESULTS_CERTIFICATE",
    subject: "Your {{eventName}} results are in",
    body: `Hi {{leaderName}},

Team {{teamName}} scored {{totalScore}} / 10 across the judging panel.

{{awardLine}}

Your certificate of participation is attached. Congratulations on building at
{{eventName}}.

— The {{eventName}} team`,
  },
];

export type TemplateVars = Record<string, string | number | null | undefined>;

/** Replace {{var}} tokens. Unknown tokens are left visible so mistakes are obvious. */
export function renderTemplate(text: string, vars: TemplateVars): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key: string) => {
    const value = vars[key];
    if (value === undefined || value === null || value === "") return match;
    return String(value);
  });
}

/** The variables a template can use, for the editor's cheat sheet. */
export const TEMPLATE_VARIABLES = [
  { key: "leaderName", label: "Team leader's name" },
  { key: "teamName", label: "Team name" },
  { key: "teamCode", label: "Team ID, e.g. AGX-4F2K" },
  { key: "track", label: "Track name" },
  { key: "college", label: "College" },
  { key: "city", label: "City" },
  { key: "memberCount", label: "Number of members" },
  { key: "eventName", label: "Event name" },
  { key: "eventDate", label: "Event date" },
  { key: "venue", label: "Venue" },
  { key: "deadline", label: "Submission deadline" },
  { key: "checkpoint", label: "Checkpoint name" },
  { key: "totalScore", label: "Weighted score" },
  { key: "awardLine", label: "Award line" },
  { key: "finalSlot", label: "Final demo slot length" },
  { key: "qaSlot", label: "Q&A slot length" },
] as const;

export const DEFAULT_VARS: TemplateVars = {
  eventName: SITE.name,
  venue: SITE.venue,
};
