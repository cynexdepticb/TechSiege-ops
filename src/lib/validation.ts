import { z } from "zod";
import { CRITERIA, SCORE_MAX, SCORE_MIN } from "@/lib/site";
import { REGISTRATION } from "@/lib/constants";

/* ─────────────────────────── registration ─────────────────────────── */

export const memberSchema = z.object({
  name: z.string().trim().min(2, "Enter the member's full name").max(100),
  email: z.email("Enter a valid email").max(254),
  phone: z
    .string()
    .trim()
    .regex(/^[+\d][\d\s-]{7,19}$/, "Enter a valid phone number")
    .or(z.literal("")),
  college: z.string().trim().min(2, "Enter the college").max(160),
  year: z.string().trim().max(60).default(""),
  isLeader: z.boolean().default(false),
});

export type MemberInput = z.infer<typeof memberSchema>;

export const teamDetailsSchema = z.object({
  name: z.string().trim().min(3, "Team name must be at least 3 characters").max(80),
  college: z.string().trim().min(2, "Enter your college").max(160),
  city: z.string().trim().max(100).default(""),
  contactName: z.string().trim().min(2, "Enter the team lead's name").max(100),
  contactEmail: z.email("Enter a valid email").max(254),
  contactPhone: z
    .string()
    .trim()
    .regex(/^[+\d][\d\s-]{7,19}$/, "Enter a valid phone number"),
  projectIdea: z.string().trim().max(2000).default(""),
  trackId: z.string().min(1, "Choose a track"),
});

export const registrationSchema = z.object({
  team: teamDetailsSchema,
  members: z
    .array(memberSchema)
    .min(REGISTRATION.MIN_TEAM_SIZE, `A team needs at least ${REGISTRATION.MIN_TEAM_SIZE} members`)
    .max(REGISTRATION.MAX_TEAM_SIZE, `A team can have at most ${REGISTRATION.MAX_TEAM_SIZE} members`),
  /** Set when a student resumes a saved draft. */
  resumeToken: z.string().optional(),
});

export type RegistrationInput = z.infer<typeof registrationSchema>;

/** Exactly one leader, and it should be the contact person. */
export function validateLeaderRule(input: RegistrationInput): string | null {
  const leaders = input.members.filter((m) => m.isLeader);
  if (leaders.length === 0) return "Mark one member as the team leader";
  if (leaders.length > 1) return "Only one member can be the team leader";
  return null;
}

/**
 * Duplicate emails within the form, and against the lead's contact email.
 *
 * The lead's own email is *expected* to equal the contact email — the form keys
 * its availability check and its draft autosave off the lead's address, and the
 * confirmation email and QR code go to the contact. So the contact email is
 * only compared against the non-leader members; the two lists that must be
 * internally unique are the members and that non-leader set.
 */
export function findDuplicateEmails(input: RegistrationInput): string[] {
  const dupes = new Set<string>();
  const seenMembers = new Set<string>();
  const nonLeader = new Set<string>();

  for (const m of input.members) {
    const key = m.email.toLowerCase();
    if (seenMembers.has(key)) dupes.add(m.email);
    seenMembers.add(key);
    if (!m.isLeader) nonLeader.add(key);
  }

  const contact = input.team.contactEmail.toLowerCase();
  if (contact && nonLeader.has(contact)) dupes.add(input.team.contactEmail);

  return [...dupes];
}

export const draftSchema = z.object({
  email: z.email("Enter a valid email to save your progress").max(254),
  step: z.number().int().min(0).max(6).default(0),
  payload: z.record(z.string(), z.unknown()).default({}),
});

/* ────────────────────────────── drafts ─────────────────────────────── */

export type DraftPayload = {
  team?: Partial<z.infer<typeof teamDetailsSchema>>;
  members?: MemberInput[];
};

/* ──────────────────────────── submissions ──────────────────────────── */

const isHttpUrl = (v: string) => /^https?:\/\/.+/i.test(v.trim());

export const submissionSchema = z.object({
  teamId: z.string().min(1),
  summary: z.string().trim().min(40, "Write at least 40 characters").max(2000),
  githubRepoUrl: z
    .string()
    .trim()
    .refine(isHttpUrl, "Enter a full https:// URL to the repository"),
  demoVideoUrl: z
    .string()
    .trim()
    .refine(isHttpUrl, "Enter a full https:// URL to the demo video"),
  architectureDiagramUrl: z
    .string()
    .trim()
    .refine((v) => v === "" || isHttpUrl(v), "Enter a full https:// URL, or leave blank"),
  apiDeclaration: z
    .string()
    .trim()
    .min(10, "Declare the external APIs and models you used, or write 'None'")
    .max(4000),
});

export type SubmissionInput = z.infer<typeof submissionSchema>;

/* ────────────────────────────── scoring ────────────────────────────── */

const criterion = z.coerce
  .number()
  .int("Use a whole number")
  .min(SCORE_MIN, `Minimum ${SCORE_MIN}`)
  .max(SCORE_MAX, `Maximum ${SCORE_MAX}`);

export const scoreSchema = z.object({
  teamId: z.string().min(1),
  comments: z.string().trim().max(4000).default(""),
  ...Object.fromEntries(CRITERIA.map((c) => [c.key, criterion])) as Record<
    (typeof CRITERIA)[number]["key"],
    typeof criterion
  >,
});

export type ScoreInput = z.infer<typeof scoreSchema>;

/* ────────────────────────────── teams ──────────────────────────────── */

export const teamStatusUpdateSchema = z.object({
  teamId: z.string().min(1),
  status: z.enum(["PENDING", "CONFIRMED", "CHECKED_IN", "DISQUALIFIED", "SUBMITTED"]),
  reason: z.string().trim().max(500).default(""),
});

export const screeningSchema = z.object({
  submissionId: z.string().min(1),
  decision: z.enum(["PENDING", "ADVANCE", "NOT_ADVANCING"]),
  notes: z.string().trim().max(2000).default(""),
});

export const sponsorSchema = z.object({
  /** Absent on create, present when moving an existing sponsor along. */
  id: z.string().trim().max(64).optional(),
  name: z.string().trim().min(2, "Enter the sponsor name").max(160),
  tier: z.enum(["TITLE", "GOLD", "SILVER", "BRONZE", "TECHNOLOGY_PARTNER", "PRIZE_IN_KIND"]),
  status: z.enum(["LEAD", "CONTACTED", "NEGOTIATING", "CONFIRMED", "PAID"]),
  contactPerson: z.string().trim().max(120).default(""),
  contactEmail: z.union([z.email("Enter a valid email"), z.literal("")]).default(""),
  amount: z.coerce.number().min(0).max(100_000_000).default(0),
  currency: z.string().trim().length(3).default("INR"),
  ownerId: z.string().optional(),
  notes: z.string().trim().max(4000).default(""),
});

export const templateSchema = z.object({
  /** Absent on create, present when editing an existing template. */
  id: z.string().trim().max(64).optional(),
  key: z.string().trim().min(2).max(60),
  name: z.string().trim().min(2).max(120),
  type: z.enum([
    "CONFIRMATION",
    "APPROVAL",
    "WORKSHOP_REMINDER",
    "PRE_EVENT_CHECKLIST",
    "CHECKPOINT_REMINDER",
    "FINALIST_ANNOUNCEMENT",
    "RESULTS_CERTIFICATE",
    "PAYMENT_ACKNOWLEDGEMENT",
    "TICKET_ISSUED",
    "CUSTOM",
  ]),
  subject: z.string().trim().min(3, "Write a subject line").max(200),
  body: z.string().trim().min(10, "Write the email body").max(20_000),
  active: z.boolean().default(true),
});

export const trackSchema = z.object({
  /** Absent on create, present when editing an existing track. */
  id: z.string().trim().max(64).optional(),
  name: z.string().trim().min(2, "Enter the track name").max(80),
  description: z.string().trim().min(10, "Describe the track").max(1000),
  requirementChecklist: z
    .array(z.string().trim().min(1).max(300))
    .max(20)
    .default([])
    .transform((v) => v.filter((line) => line.length > 0)),
  capacity: z.coerce.number().int().min(0).max(10_000).nullable().default(null),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
  active: z.boolean().default(true),
});

/* ────────────────────── panel, volunteers, assignments ──────────────── */

export const panelMemberSchema = z.object({
  id: z.string().trim().max(64).optional(),
  kind: z.enum(["JUDGE", "MENTOR"]),
  name: z.string().trim().min(2, "Enter their name").max(100),
  email: z.email("Enter a valid email").max(254),
  org: z.string().trim().max(120).default(""),
  title: z.string().trim().max(120).default(""),
  phone: z
    .string()
    .trim()
    .regex(/^[+\d][\d\s-]{7,19}$/, "Enter a valid phone number")
    .or(z.literal(""))
    .default(""),
  bio: z.string().trim().max(1000).default(""),
  confirmed: z.boolean().default(false),
  active: z.boolean().default(true),
});

export const volunteerSchema = z.object({
  id: z.string().trim().max(64).optional(),
  name: z.string().trim().min(2, "Enter their name").max(100),
  email: z.union([z.email("Enter a valid email"), z.literal("")]).default(""),
  phone: z
    .string()
    .trim()
    .regex(/^[+\d][\d\s-]{7,19}$/, "Enter a valid phone number")
    .or(z.literal(""))
    .default(""),
  shift: z.enum(["MORNING", "AFTERNOON", "NIGHT", "FULL_DAY"]).default("MORNING"),
  station: z
    .enum(["REGISTRATION_DESK", "MENTOR_DESK", "SUBMISSION_DESK", "HELP_DESK"])
    .default("REGISTRATION_DESK"),
});

/** Binds a panel member to the teams they judge or mentor. */
export const assignmentSchema = z.object({
  panelId: z.string().min(1, "Choose a panel member"),
  teamId: z.string().min(1, "Choose a team"),
});

export const staffSchema = z.object({
  name: z.string().trim().min(2, "Enter their name").max(100),
  email: z.email("Enter a valid email").max(254),
  role: z.enum(["SUPER_ADMIN", "TEAM_LEAD", "VOLUNTEER", "JUDGE", "MENTOR"]),
  vertical: z
    .enum([
      "SPONSORSHIP",
      "MARKETING",
      "TECHNICAL",
      "PROBLEM_STATEMENTS",
      "MENTOR_JUDGE_RELATIONS",
      "LOGISTICS",
      "MEDIA",
      "VOLUNTEER_SUPPORT",
    ])
    .nullable()
    .default(null),
  password: z.string().min(10, "Use at least 10 characters").max(200).optional(),
  active: z.boolean().default(true),
  /**
   * Judges and mentors cannot use their portal without a PanelMember record —
   * assignments and scores hang off it. Creating the account links the two;
   * when this is omitted the server falls back to matching the email.
   */
  panelMemberId: z.string().trim().max(64).nullable().default(null),
  /** Optional: ties a volunteer login to its roster entry. */
  volunteerId: z.string().trim().max(64).nullable().default(null),
}).refine((v) => v.role !== "TEAM_LEAD" || v.vertical !== null, {
  message: "Team leads need a vertical",
  path: ["vertical"],
});

/* ──────────────────────────── check-in ────────────────────────────── */

export const checkinSchema = z
  .object({
    /** Raw QR payload: the team's qrToken, or a full URL containing it. */
    payload: z.string().trim().max(500).optional(),
    /**
     * Manual entry from the checkpoint board, where there is no code to scan.
     * Exactly one of `payload` / `teamId` must be present.
     */
    teamId: z.string().trim().max(64).optional(),
    checkpoint: z
      .enum(["REGISTRATION", "ROUND_1", "ROUND_2", "MIDNIGHT", "SUBMISSION"])
      .default("REGISTRATION"),
    note: z.string().trim().max(300).default(""),
    /** Overrides the recorded name of whoever logged it. */
    notedBy: z.string().trim().max(80).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.payload && v.teamId) {
      ctx.addIssue({
        code: "custom",
        message: "Provide either a scanned code or a team, not both.",
        path: ["payload"],
      });
    } else if (!v.payload && !v.teamId) {
      ctx.addIssue({
        code: "custom",
        message: "Scan a team QR code.",
        path: ["payload"],
      });
    }
  });

/* ───────────────────────────── analytics ──────────────────────────── */

export const eventSchema = z.object({
  type: z.enum(["PAGE_VIEW", "FORM_START", "FORM_STEP", "FORM_ABANDON", "FORM_COMPLETE"]),
  path: z.string().max(300).default(""),
  visitorId: z.string().max(64).default(""),
  step: z.number().int().min(0).max(20).optional(),
  teamId: z.string().optional(),
});

export const bulkSendSchema = z.object({
  templateKey: z.string().min(1),
  type: z.enum([
    "CONFIRMATION",
    "APPROVAL",
    "WORKSHOP_REMINDER",
    "PRE_EVENT_CHECKLIST",
    "CHECKPOINT_REMINDER",
    "FINALIST_ANNOUNCEMENT",
    "RESULTS_CERTIFICATE",
    "PAYMENT_ACKNOWLEDGEMENT",
    "TICKET_ISSUED",
    "CUSTOM",
  ]),
  trackId: z.string().optional(),
  status: z.enum(["PENDING", "CONFIRMED", "CHECKED_IN", "SUBMITTED"]).optional(),
  checkpoint: z.enum(["REGISTRATION", "ROUND_1", "ROUND_2", "MIDNIGHT", "SUBMISSION"]).optional(),
  /** Cap a send so nobody accidentally emails 200 people. */
  limit: z.coerce.number().int().min(1).max(500).default(50),
});

export const settingSchema = z.object({
  key: z.string().trim().min(1).max(64),
  value: z.string().max(2000),
});

/* ─────────────────────────────── payment ────────────────────────────── */

export const paymentSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("mark-paid"),
    amountPaid: z.coerce.number().min(0).max(10_000_000).nullish(),
    paymentRef: z.string().trim().max(120).optional(),
  }),
  z.object({
    action: z.literal("send-ticket"),
  }),
  z.object({
    action: z.literal("resend-tickets"),
  }),
]);

