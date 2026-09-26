/**
 * Imports team registrations made on the marketing site into the ops app.
 *
 * ── Why this exists ────────────────────────────────────────────────────────
 * The marketing site (frontend/ + backend/) and this app are two independent
 * systems that happen to share one Postgres database:
 *
 *   marketing  POST /api/register → Express  →  public.teams / public.members
 *   ops        POST /api/register → Next.js  →  ops.teams    / ops.participants
 *
 * The marketing form knows nothing about this app, so a team registered there
 * is invisible here: no team code, no check-in QR, nothing for a volunteer to
 * scan. This script bridges the gap.
 *
 * ── Field mapping ──────────────────────────────────────────────────────────
 * The two schemas disagree in a few places, so a straight column copy is not
 * possible:
 *
 *   marketing track_id          → ops track slug          (see TRACK_MAP)
 *   marketing institution       → ops college, and the college of every member
 *   marketing members[].is_lead → ops Team.contact* + Participant.role
 *   marketing has no code/QR    → generated here
 *   marketing created_at        → ops createdAt           (preserved)
 *
 * A marketing team has no separate contact email, so the lead member is used
 * as the team contact — that is also who the confirmation and QR go to.
 *
 * ── Idempotency ────────────────────────────────────────────────────────────
 * The marketing table's UUID is stored in `Team.sourceRef` and used as the
 * upsert key, so re-running only touches rows that actually changed. Names are
 * not usable as a key: the marketing site does not enforce team-name
 * uniqueness, and its seed contains several teams sharing a name.
 *
 * Usage:
 *   npm run db:sync-registrations              # import, skipping [demo] rows
 *   npm run db:sync-registrations -- --dry-run # report, change nothing
 *   npm run db:sync-registrations -- --include-demo
 *   npm run db:sync-registrations -- --strict-capacity
 */

import "dotenv/config";
import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

/** Marketing track ids (frontend/lib/content.ts, enforced in backend/src/routes/register.ts)
 *  → ops track slugs (prisma/seed.ts). Both lists are verified against the
 *  database at startup; an unmapped id is a hard error, never a silent skip. */
const TRACK_MAP: Record<string, string> = {
  autonomous: "autonomous-ai",
  education: "ai-for-education",
  healthcare: "ai-for-healthcare",
  finance: "ai-for-finance",
  social: "ai-for-social-impact",
  devagents: "ai-developer-agents",
};

/** Seeded marketing rows are named "[demo] Team N". They exist to populate the
 *  marketing demo, and would otherwise show up as real entrants in the ops
 *  team list, check-in counters and analytics. */
const DEMO_PREFIX = "[demo]";

/** Human-friendly, unambiguous team code: no O/0/I/1. Mirrors
 *  makeTeamCode() in src/lib/registration.ts. */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const includeDemo = args.includes("--include-demo");
const strictCapacity = args.includes("--strict-capacity");

function makeTeamCode(): string {
  const bytes = randomBytes(4);
  let suffix = "";
  for (const b of bytes) suffix += ALPHABET[b % ALPHABET.length];
  return `AGX-${suffix}`;
}

const makeToken = (bytes = 24) => randomBytes(bytes).toString("base64url");

/** ── source rows (marketing schema) ────────────────────────────────────── */

type SourceMember = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  branch_year: string;
  is_lead: boolean;
  created_at: Date;
};

type SourceTeam = {
  id: string;
  team_name: string;
  institution: string;
  city: string;
  track_id: string;
  project_idea: string;
  created_at: Date;
  members: SourceMember[];
};

async function readSourceTeams(source: Client): Promise<SourceTeam[]> {
  // `public.` is qualified explicitly: DATABASE_URL carries `?schema=ops`, which
  // the pg driver ignores (it is a Prisma engine convention), so relying on the
  // connection's search_path would silently read the wrong schema.
  const { rows } = await source.query<SourceTeam & { members: unknown }>(
    `SELECT t.id, t.team_name, t.institution, t.city, t.track_id, t.project_idea, t.created_at,
            COALESCE(
              json_agg(
                json_build_object(
                  'id', m.id, 'full_name', m.full_name, 'email', m.email,
                  'phone', m.phone, 'branch_year', m.branch_year,
                  'is_lead', m.is_lead, 'created_at', m.created_at
                ) ORDER BY m.is_lead DESC, m.created_at ASC
              ) FILTER (WHERE m.id IS NOT NULL),
              '[]'::json
            ) AS members
       FROM public.teams t
       LEFT JOIN public.members m ON m.team_id = t.id
      GROUP BY t.id
      ORDER BY t.created_at ASC`,
  );
  return rows as SourceTeam[];
}

// ── reporting ─────────────────────────────────────────────────────────────

type Note = { kind: "warn" | "error" | "info"; msg: string };
const notes: Note[] = [];
const note = (kind: Note["kind"], msg: string) => {
  notes.push({ kind, msg });
  if (kind !== "info") console.log(`  ${kind === "error" ? "✗" : "!"} ${msg}`);
};

async function main() {
  console.log(dryRun ? "\nDRY RUN — nothing will be written\n" : "\nSyncing marketing registrations → ops\n");

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set.");

  const source = new Client({ connectionString });
  await source.connect();
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString }, { schema: "ops" }),
  });

  let created = 0;
  let updated = 0;
  let skipped = 0;

  try {
    // ── source ────────────────────────────────────────────────────────────
    let teams: SourceTeam[];
    try {
      teams = await readSourceTeams(source);
    } catch (e) {
      throw new Error(
        `Could not read public.teams (${(e as Error).message}). The marketing site's ` +
          `database is usually created by "npm run migrate" in backend/. If the site has ` +
          `never run, there is nothing to import.`,
      );
    }

    if (includeDemo) {
      teams = teams.filter((t) => !t.team_name.startsWith(DEMO_PREFIX));
    }
    const skippedDemo = teams.filter((t) => t.team_name.startsWith(DEMO_PREFIX)).length;
    teams = teams.filter((t) => !t.team_name.startsWith(DEMO_PREFIX));

    if (teams.length === 0) {
      console.log("  No marketing registrations to import.");
      return;
    }
    console.log(
      `  source: ${teams.length} team(s)` +
        (skippedDemo ? `  (${skippedDemo} [demo] skipped — pass --include-demo to take them)` : ""),
    );

    // ── destination pre-flight ────────────────────────────────────────────
    const tracks = await prisma.track.findMany({
      select: { id: true, slug: true, name: true, capacity: true, active: true, _count: { select: { teams: true } } },
    });
    const bySlug = new Map(tracks.map((t) => [t.slug, t]));

    const unknownTracks = [...new Set(teams.map((t) => t.track_id))].filter((id) => !TRACK_MAP[id]);
    if (unknownTracks.length) {
      throw new Error(
        `Marketing track id(s) with no ops mapping: ${unknownTracks.join(", ")}. ` +
          `Add them to TRACK_MAP in scripts/sync-registrations.ts and re-run.`,
      );
    }
    const mappedSlugs = new Set(Object.values(TRACK_MAP));
    const missingInOps = [...mappedSlugs].filter((slug) => !bySlug.has(slug));
    if (missingInOps.length) {
      throw new Error(
        `TRACK_MAP points at ops track(s) that do not exist: ${missingInOps.join(", ")}. ` +
          `Run "npm run db:seed", or correct TRACK_MAP.`,
      );
    }

    const maxTeams = Number(
      ((await prisma.setting.findUnique({ where: { key: "max_teams" }, select: { value: true } }))?.value ??
        "60"),
    );
    const existingTotal = await prisma.team.count({ where: { status: { not: "DISQUALIFIED" } } });

    console.log(`  target: ops, ${existingTotal} team(s) already present (cap ${maxTeams})\n`);

    // ── import ────────────────────────────────────────────────────────────
    for (const src of teams) {
      const label = `${src.team_name} (${src.institution})`;
      const track = bySlug.get(TRACK_MAP[src.track_id])!;

      // Contact = the lead member, else the earliest member. A marketing team
      // always has ≥2 members, but a hand-edited row might not, and ops
      // requires a contact email.
      const contact = src.members.find((m) => m.is_lead) ?? src.members[0];
      if (!contact) {
        skipped++;
        note("error", `${label}: no members in public.members, cannot determine a contact — skipped.`);
        continue;
      }

      const existing = await prisma.team.findUnique({ where: { sourceRef: src.id } });
      const projected = (track._count.teams ?? 0) + (existing ? 0 : 1);
      if (track.capacity !== null && projected > track.capacity) {
        const msg = `${label}: ${track.name} is at capacity (${track._count.teams}/${track.capacity}).`;
        if (strictCapacity) {
          skipped++;
          note("error", `${msg} Skipped (--strict-capacity).`);
          continue;
        }
        // Registration through the ops form hard-rejects at this point. A team
        // that the marketing site already accepted is a real entrant, though,
        // and dropping it silently would be worse than an over-capacity warning.
        note("warn", `${msg} Imported anyway — raise the capacity in /admin/tracks.`);
      }

      const data = {
        name: src.team_name,
        college: src.institution,
        city: src.city,
        trackId: track.id,
        contactName: contact.full_name,
        contactEmail: contact.email.toLowerCase(),
        contactPhone: contact.phone,
        projectIdea: src.project_idea,
        // The upsert key. Without this the re-run creates a duplicate instead
        // of updating, so it must be set on both paths.
        sourceRef: src.id,
        createdAt: src.created_at,
      };

      if (dryRun) {
        console.log(`  → would ${existing ? "update" : "create"}  ${label}  [${track.name}]`);
        continue;
      }

      // Unique `code` and `qrToken` are generated, so an upsert that collides
      // retries rather than aborting the whole import.
      const team = await (async () => {
        for (let attempt = 0; attempt < 5; attempt++) {
          try {
            return existing
              ? await prisma.team.update({ where: { id: existing.id }, data })
              : await prisma.team.create({
                  data: { ...data, code: makeTeamCode(), qrToken: makeToken(18) },
                });
          } catch (e) {
            const msg = (e as { message?: string }).message ?? "";
            if (existing || (!/code|qrToken/.test(msg) && !/Unique constraint/.test(msg))) throw e;
          }
        }
        throw new Error(`${label}: could not generate a unique team code after 5 attempts.`);
      })();

      // ── members ─────────────────────────────────────────────────────────
      // Participant.email is unique across the whole app, not per team. If the
      // same person also registered through the ops form, their ops-side record
      // is left untouched and the collision is reported rather than merged.
      let addedMembers = 0;
      let conflicted = 0;
      for (const m of src.members) {
        const email = m.email.toLowerCase();
        const holder = await prisma.participant.findUnique({ where: { email }, select: { teamId: true } });
        if (holder && holder.teamId === team.id) {
          await prisma.participant.update({
            where: { email },
            data: {
              name: m.full_name,
              phone: m.phone,
              college: src.institution,
              year: m.branch_year,
              role: m.is_lead ? ("LEADER" as const) : ("MEMBER" as const),
            },
          });
        } else if (holder) {
          conflicted++;
          note("warn", `${label}: ${email} is already on another ops team — member not imported.`);
          continue;
        } else {
          await prisma.participant.create({
            data: {
              name: m.full_name,
              email,
              phone: m.phone,
              college: src.institution,
              year: m.branch_year,
              role: m.is_lead ? ("LEADER" as const) : ("MEMBER" as const),
              teamId: team.id,
            },
          });
          addedMembers++;
        }
      }

      if (existing) {
        updated++;
        console.log(`  ✓ updated  ${label}  [${track.name}]  ${addedMembers} new member(s)`);
      } else {
        created++;
        const url = `${(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3100").replace(/\/$/, "")}/checkin/${team.qrToken}`;
        console.log(`  ✓ created  ${label}  ${team.code}  [${track.name}]  ${addedMembers} member(s)`);
        console.log(`            check-in QR: ${url}`);
      }
      if (conflicted) console.log(`            (${conflicted} member(s) skipped — email already registered in ops)`);
    }

    if (dryRun) {
      console.log("\n  Dry run complete. Re-run without --dry-run to apply.\n");
      return;
    }

    const total = await prisma.team.count();
    console.log(`\n  Done: ${created} created, ${updated} updated, ${skipped} skipped. ops now has ${total} team(s).`);
    if (created > 0) {
      console.log("  Imported teams are PENDING and have not been emailed — confirm or check them in from /admin/teams.\n");
    } else {
      console.log("");
    }
  } finally {
    await prisma.$disconnect();
    await source.end();
  }
}

main().catch((e) => {
  console.error(`\nSync failed: ${e.message}\n`);
  process.exit(1);
});
