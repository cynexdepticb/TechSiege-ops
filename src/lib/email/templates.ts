import { CRITERIA, SITE } from "@/lib/site";

/** Seeded templates. `{{var}}` placeholders are filled by renderTemplate(). */
export type TemplateSeed = {
  key: string;
  name: string;
  type:
    | "CONFIRMATION"
    | "APPROVAL"
    | "WORKSHOP_REMINDER"
    | "PRE_EVENT_CHECKLIST"
    | "CHECKPOINT_REMINDER"
    | "FINALIST_ANNOUNCEMENT"
    | "RESULTS_CERTIFICATE"
    | "PAYMENT_ACKNOWLEDGEMENT"
    | "TICKET_ISSUED";
  subject: string;
  body: string;
};

export const TEMPLATE_SEEDS: TemplateSeed[] = [
  {
    key: "registration_confirmation",
    name: "Registration confirmation",
    type: "CONFIRMATION",
    subject: "Registration Received — Team {{teamCode}} · {{eventName}}",
    body: `Hi {{leaderName}},

Team {{teamName}} has been registered for {{eventName}} in the {{track}} track.

Team Details:
- Team Name: {{teamName}}
- Team ID: {{teamCode}}
- Track: {{track}}
- College: {{college}}
- Members: {{memberCount}}

Payment & Admission:
Your registration is pending payment verification. Once payment is confirmed by the operations team, individual PDF admission tickets with unique check-in QR codes will be sent to your email.

Event Details:
- Event: {{eventName}}
- Dates: 30–31 October 2026
- Venue: {{venue}}

The {{eventName}} Team`,
  },
  {
    key: "payment_acknowledgement",
    name: "Payment confirmation & tickets",
    type: "PAYMENT_ACKNOWLEDGEMENT",
    subject: "TechSiege 2026 — Registration Confirmed & Tickets",
    body: `Hi {{leaderName}},

We've received and verified the entry fee for team {{teamName}}. Your registration for {{eventName}} is officially confirmed!

Team Details:
- Team Name: {{teamName}}
- Team ID: {{teamCode}}
- Track: {{track}}
- College: {{college}}

Attached to this email are the admission tickets for all registered team members. Each ticket contains a unique QR code required for check-in at the venue. Please share each ticket with the respective member.

Event Details:
- Event: {{eventName}} (BUILD. AUTOMATE. ACT.)
- Event Date: {{eventDate}}
- Venue: {{venue}}
- Check-in Time: 8:30 AM

See you on {{eventDate}} at {{venue}}!

The {{eventName}} Operations Team`,
  },
  {
    key: "ticket_issued",
    name: "Ticket & check-in QR",
    type: "TICKET_ISSUED",
    subject: "Admission Tickets — Team {{teamCode}} · {{eventName}}",
    body: `Hi {{leaderName}},

Here are the official admission tickets for team {{teamName}} ({{teamCode}}).

Attached to this email are the individual PDF admission tickets for each team member. Each PDF contains that member's unique Ticket ID and check-in QR code.

Event Details:
- Event: {{eventName}}
- Dates: 30–31 October 2026
- Venue: {{venue}}
- Check-in Time: 8:30 AM

Instructions:
1. Share each individual PDF ticket with the corresponding team member.
2. Present the ticket QR code at the check-in desk upon arrival.
3. Bring a valid college ID card.

The {{eventName}} Operations Team`,
  },
  {
    key: "approval_confirmation",
    name: "Approval confirmation",
    type: "APPROVAL",
    subject: "Team {{teamCode}} approved for {{eventName}}",
    body: `Hi {{leaderName}},

Team {{teamName}} has been approved for the {{track}} track at {{eventName}}.

Team Details:
- Team Name: {{teamName}}
- Team ID: {{teamCode}}
- Track: {{track}}
- Members: {{memberCount}}

Check-in opens 8:30 AM on {{eventDate}} at {{venue}}. Please arrive early for
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

1. Every team member has their admission ticket PDF (digital or printed).
2. All members have valid college ID cards.
3. Bring laptops, chargers, and extension leads.
4. Your repository is initialized and ready.

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

A mentor will review your progress. Have your repo, a
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
  { key: "amountPaid", label: "Entry fee received" },
  { key: "paymentRef", label: "UPI / bank reference for the transfer" },
  { key: "ticketUrl", label: "Link to the team's own ticket page" },
  { key: "totalScore", label: "Weighted score" },
  { key: "awardLine", label: "Award line" },
  { key: "finalSlot", label: "Final demo slot length" },
  { key: "qaSlot", label: "Q&A slot length" },
] as const;

export const DEFAULT_VARS: TemplateVars = {
  eventName: SITE.name,
  venue: SITE.venue,
};
