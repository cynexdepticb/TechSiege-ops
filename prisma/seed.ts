import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import { hashPassword } from "../src/lib/password-core";
import { TEMPLATE_SEEDS } from "../src/lib/email/templates";
import { Role } from "../src/generated/prisma/enums";

const prisma = new PrismaClient({
  // The `?schema=` URL param is a Prisma-engine convention that the `pg`
  // adapter ignores, so the schema has to be passed explicitly.
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }, { schema: "ops" }),
});

const TRACK_DEFS = [
  {
    slug: "autonomous-ai",
    name: "Autonomous AI",
    description:
      "Agents that plan and execute multi-step work with real tool use, memory and recovery.",
    capacity: 12,
  },
  {
    slug: "ai-for-education",
    name: "AI for Education",
    description:
      "Tutors, revision planners and classroom tooling that actually help a student learn.",
    capacity: 10,
  },
  {
    slug: "ai-for-healthcare",
    name: "AI for Healthcare",
    description:
      "Clinical and public-health assistants with safety and privacy handled honestly.",
    capacity: 10,
  },
  {
    slug: "ai-for-finance",
    name: "AI for Finance",
    description: "Analysis, reconciliation and decision support for money workflows.",
    capacity: 8,
  },
  {
    slug: "ai-for-social-impact",
    name: "AI for Social Impact",
    description:
      "Agents for civic access, livelihoods, agriculture and public services.",
    capacity: 10,
  },
  {
    slug: "ai-developer-agents",
    name: "AI Developer Agents",
    description: "Agents that write, review, test and maintain software.",
    capacity: 10,
  },
];

/**
 * Tables in dependency order so a re-run always starts clean. The seed wipes
 * before it writes, so `npm run db:seed` is idempotent — it always produces
 * the same starting state instead of failing on the first unique constraint.
 *
 * This is a **clean slate**: the admin account and the base configuration the
 * app needs to function, and nothing else. No teams, judges, mentors,
 * volunteers, sponsors or history — those are entered through the admin UI as
 * the event is set up.
 */
const TABLES = [
  "audit_logs",
  "communication_logs",
  "analytics_events",
  "registration_drafts",
  "scores",
  "assignments",
  "checkpoint_logs",
  "submissions",
  "participants",
  "teams",
  "volunteers",
  "panel_members",
  "sponsors",
  "email_templates",
  "users",
  "tracks",
  "settings",
];

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? "admin@agentx.dev";
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? "agentx2026";

async function main() {
  console.log("Seeding AGENTX 2026 ops platform (clean slate)…\n");

  /* ── clear previous data ── */
  for (const table of TABLES) {
    // Qualified with the schema: the pg adapter has no search_path, and Neon
    // rejects `options=-c search_path`, so it cannot be set per connection.
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE ops."${table}" CASCADE`);
  }
  console.log(`  cleared ${TABLES.length} tables`);

  /* ── settings ── */
  await prisma.setting.createMany({
    data: [
      { key: "event_name", value: "AGENTX 2026" },
      { key: "submission_deadline", value: "2026-10-31T10:00:00+05:30" },
      { key: "registration_open", value: "true" },
      { key: "max_teams", value: "60" },
    ],
  });
  console.log("  4 settings");

  /* ── tracks ──
   * Base config, not demo data: public registration reads these to build its
   * track picker, so an event with no tracks cannot accept a single team.
   */
  for (const [i, t] of TRACK_DEFS.entries()) {
    await prisma.track.create({
      data: {
        slug: t.slug,
        name: t.name,
        description: t.description,
        capacity: t.capacity,
        sortOrder: i,
        requirementChecklist: [
          "GitHub repository with a README",
          "2–3 minute demo video",
          "Agent architecture diagram",
          "Declaration of external APIs and models used",
        ],
      },
    });
  }
  console.log(`  ${TRACK_DEFS.length} tracks`);

  /* ── the only account ──
   * Every other login is created by the super admin from
   * /admin/settings, which is the point of the clean slate: there are no
   * seeded staff, panel or volunteer credentials to leak or forget to rotate.
   */
  await prisma.user.create({
    data: {
      name: "Core Team",
      email: ADMIN_EMAIL,
      role: Role.SUPER_ADMIN,
      vertical: null,
      passwordHash: await hashPassword(ADMIN_PASSWORD),
      active: true,
    },
  });
  console.log("  1 account (super admin)");

  /* ── email templates ── */
  for (const t of TEMPLATE_SEEDS) {
    await prisma.emailTemplate.create({ data: t });
  }
  console.log(`  ${TEMPLATE_SEEDS.length} email templates`);

  console.log("\nDone. The database holds base config only — no demo data.");
  console.log(`\nSign in at /signin with\n  ${ADMIN_EMAIL}\n  password: ${ADMIN_PASSWORD}\n`);
  console.log("Everything else is created from the admin UI:");
  console.log("  /admin/settings  staff, panel and volunteer accounts");
  console.log("  /admin/tracks    tracks and their submission checklists");
  console.log("  /admin/panel     judges, mentors, volunteers, team assignments");
  console.log("  /admin/sponsors  sponsor pipeline");
  console.log("  /admin/templates email templates\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
