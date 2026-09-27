# TechSiege — Operations Platform

Internal admin and event-day operations system for TechSiege: team registration,
automated communications, analytics, judging, sponsor CRM, and the live check-in
desk.

This is a **standalone Next.js app**. It is deliberately separate from the
`frontend/` marketing site and the `backend/` Express service — nothing in this
directory is imported by them, and nothing in them should be imported here.

---

## Stack

| Layer      | Choice                                                  |
| ---------- | ------------------------------------------------------- |
| Framework  | Next.js 16 (App Router) + React 19, TypeScript           |
| Database   | PostgreSQL (Neon) + Prisma 7                            |
| Auth       | NextAuth v5 (Auth.js), credentials + optional Google     |
| Styling    | Tailwind CSS 4 + Radix primitives                        |
| Charts     | Recharts                                                 |
| Validation | Zod 4                                                    |
| Email      | Nodemailer over SMTP, with a console dev fallback         |

---

## Setup

```bash
cp .env.example .env      # then fill in DATABASE_URL and AUTH_SECRET
npm install
npm run setup             # prisma generate + migrate deploy + seed
npm run dev               # http://localhost:3100
```

`AUTH_SECRET` is the one value that must be generated rather than copied:

```bash
openssl rand -base64 32
```

### Environment variables

| Variable                | Required | Purpose                                             |
| ----------------------- | -------- | --------------------------------------------------- |
| `DATABASE_URL`          | yes      | Postgres connection string, `?schema=ops`           |
| `AUTH_SECRET`           | yes      | Session signing secret                               |
| `NEXT_PUBLIC_SITE_URL`  | prod     | Absolute origin for QR codes and email links         |
| `NEXT_PUBLIC_EVENT_NAME`| no       | Event name in the UI and email subjects              |
| `SUPPORT_EMAIL`         | no       | Reply-to address                                     |
| `EMAIL_FROM`            | no       | From address for outbound mail                       |
| `SMTP_HOST`             | no       | Defaults to `smtp.gmail.com`                         |
| `SMTP_PORT`             | no       | `587` (STARTTLS) or `465` (implicit TLS)             |
| `SMTP_USER`             | no       | Mailbox to send from                                  |
| `SMTP_PASSWORD`         | no       | App password — **not** the account password          |
| `AUTH_GOOGLE_ID`        | no       | Both must be set or the Google provider is skipped   |
| `AUTH_GOOGLE_SECRET`    | no       |                                                        |

### Email delivery

All outbound mail goes over SMTP through nodemailer. `src/lib/email/send.ts` is
the single transport; when `SMTP_USER` and `SMTP_PASSWORD` are unset it logs the
rendered email to the console instead of sending, so local development still
walks the whole path.

**Why not a hosted email API?** Services like Resend only send from a domain you
have verified, and a consumer mailbox can never be one — `From:
someone@gmail.com` is rejected with a 403 and the message is never delivered.
A mail server has no such rule: with an app password, Gmail sends from the real
account to any recipient.

To set it up:

1. Turn on 2-Step Verification at <https://myaccount.google.com/security>.
2. Create an app password at <https://myaccount.google.com/apppasswords>. Name it
   anything; Google returns 16 characters.
3. Put those 16 characters in `SMTP_PASSWORD` and set `EMAIL_FROM` to
   `"TechSiege <cynex.depticb@gmail.com>"`.

Two caveats: an ordinary Gmail account is capped at roughly **500 messages a
day**, which is why `/admin/comms` shows a banner while SMTP is active. And
SMTP gives no delivery or open webhooks, so those columns stay empty and only
`SENT`/`FAILED` are recorded. Use a domain you own if you later need to exceed
the cap or track opens.

### Scripts

| Script                         | Does                                                |
| ------------------------------ | --------------------------------------------------- |
| `npm run dev`                  | Dev server on port 3100                            |
| `npm run build`                | `prisma generate` then a production build          |
| `npm run start`                | Serve the production build on 3100                |
| `npm run typecheck`            | `tsc --noEmit`                                    |
| `npm run lint`                 | ESLint                                            |
| `npm run db:migrate`           | Create + apply a migration in development         |
| `npm run db:deploy`            | Apply pending migrations (CI/production)          |
| `npm run db:seed`              | Wipe and regenerate base config + the admin login |
| `npm run db:reset`             | Drop, re-migrate, re-seed from scratch            |
| `npm run db:studio`            | Prisma Studio                                     |
| `npm run db:sync-registrations` | Import marketing-site registrations — see below   |
| `npm run setup`                | `generate` + `deploy` + `seed`, for a fresh clone  |

`db:seed` is **destructive and idempotent** — it truncates every table before
rebuilding the base config, so re-running it always gives you the same shape of
data rather than failing on a unique constraint.

**What the seed creates, and what it deliberately does not.** It is a
clean-slate seed, not a demo-data seed: settings, the six tracks, the seven email
templates, and one super admin. No teams, panel members, volunteers, sponsors,
communications, analytics or audit rows.

That is intentional — the app has no hard delete for accounts, so demo rows
would be permanent — but it means **nothing else is created for you**. Every team
lead, judge, mentor and volunteer is an account you create in the UI
(`/admin/settings`, `/admin/panel`) or a real registration arriving through
`/register` or the marketing import below. Two consequences worth knowing:

- A `JUDGE` or `MENTOR` account is **refused** unless a `PanelMember` record
  already exists for them. The seat is the record; the login is just a way in.
- Creating the account and creating the roster record are separate steps, so the
  account dialog links them in one transaction. An account left without a roster
  record gets a "no panel record" warning badge in the staff list rather than a
  login that leads nowhere.

The seed's login is overridable with `SEED_ADMIN_EMAIL` and
`SEED_ADMIN_PASSWORD`.

---

## Importing marketing-site registrations

The marketing site and this app are two independent systems that happen to share
one Postgres database:

|            | Endpoint              | Writes to                    |
| ---------- | --------------------- | ---------------------------- |
| Marketing  | Express `POST /api/register` | `public.teams`, `public.members` |
| Ops        | Next `POST /api/register`    | `ops.teams`, `ops.participants`  |

They share a database but not a schema, and the marketing form knows nothing
about this app. So a team registered on the public site is invisible here: no
team code, no check-in QR, nothing for a volunteer to scan.

`scripts/sync-registrations.ts` bridges that gap:

```bash
npm run db:sync-registrations -- --dry-run   # report, change nothing
npm run db:sync-registrations                # apply
```

Run it after the marketing site takes registrations. It is safe to re-run.

**How it maps the two schemas.** They disagree in a few places, so a straight
column copy is not possible:

| Marketing (`public`)      | Ops (`ops`)                                    |
| ------------------------- | ---------------------------------------------- |
| `track_id`                | track slug, via `TRACK_MAP` in the script      |
| `institution`             | `college`, on the team and on every member     |
| `members[].is_lead`       | `Team.contact*` and `Participant.role`         |
| no code, no QR            | generated (`AGX-XXXX`, random token)           |
| `created_at`              | `createdAt`, preserved                         |

A marketing team has no separate contact email, so the **lead member becomes the
team contact** — also who the confirmation and QR go to. Members with no
`is_lead` flag still import; the contact simply falls back to the earliest member.

**Idempotency** comes from `Team.sourceRef`, which stores the marketing table's
UUID. Names cannot serve as the key: the marketing site does not enforce
team-name uniqueness, so re-running on a name match would merge distinct teams.

**Known limits, on purpose:**

- **Members are only ever added or updated, never removed.** Deleting a member
  upstream does not delete them here. This is the safe direction — a sync should
  not be able to destroy operational data — but it means a genuine removal has
  to be done by hand in `/admin/teams`.
- **Over-capacity teams import with a warning**, rather than being skipped. The
  ops registration form hard-rejects a team whose track is full; a team the
  marketing site already accepted is a real entrant, and dropping it silently
  would be the worse failure. Pass `--strict-capacity` to match the form instead.
- **A member email already registered on a different ops team is not imported**,
  and is reported. The existing ops record is left alone rather than hijacked.
- Teams named `[demo] …` are skipped; pass `--include-demo` to take them.
- Imported teams are `PENDING` and are **not emailed**. Confirm them from
  `/admin/teams`, where the check-in QR is also available.

---

## Seed credentials

One account, and one only.

| Email              | Password     | Role        | Lands on  |
| ------------------ | ------------ | ----------- | --------- |
| `admin@agentx.dev` | `agentx2026` | Super admin | `/admin`  |

There are no seeded team leads, judges, mentors or volunteers, because the seed
is a clean slate — see the note above. Create them in the UI: accounts in
`/admin/settings`, roster records in `/admin/panel`. Both are needed for a judge
or mentor to be able to log in at all.

---

## Access model

Roles come from the `User` table. A **team lead** is additionally scoped to one
vertical, and that vertical decides which modules they can open.

| Role          | Sees                                                              |
| ------------- | ----------------------------------------------------------------- |
| `SUPER_ADMIN` | Everything, including settings and staff management                |
| `TEAM_LEAD`   | Their vertical's modules, plus the shared operational ones        |
| `VOLUNTEER`   | `/checkin` only — the scanner and their own recent scans           |
| `JUDGE`       | `/judge` only — the teams they are assigned                        |
| `JUDGE`/`MENTOR` cannot reach `/admin` at all; they are redirected to their portal.

Two rules keep this honest:

- **Reads are wider than writes.** Every team lead can read the shared
  operational picture — analytics, teams, submissions, judging, tracks, check-in
  — because every vertical needs it. Writes are narrower: only the super admin
  changes teams, scores, tracks or sends communications, and a team lead writes
  only in the module their vertical owns. Check-in is the one deliberate
  cross-vertical write, because any station needs to scan any team.
- **The assignment is the boundary, not a filter.** A judge sees only teams with
  an `Assignment` row pointing at their `PanelMember` record, and the scoring
  endpoint re-checks that same assignment server-side. Guessing a valid team id
  returns 403. The same holds for mentor feedback.

Enforcement is layered: `proxy.ts` rejects requests with no session cookie
(401 JSON for `/api/*`, so `fetch` callers get a status they can branch on), and
then `requireActor()` / `requireModule()` in `src/lib/guards.ts` do the real
check against the database. The proxy gate alone is not authorisation.

Role changes take effect on the next request — the JWT callback re-reads the
user row, and a deactivated account gets a session with no user, which every
server guard rejects.

---

## Layout

```
prisma/
  schema.prisma          all models, enums, indexes
  seed.ts                demo data (destructive, idempotent)
  migrations/            checked-in SQL
prisma7.config.ts        Prisma 7 config; the seed hook lives here
src/
  app/
    (portal)/            every signed-in route; the group keeps them off the URL
      admin/             12 modules, gated by requireModule()
      checkin/           standalone volunteer page, phone-first
      judge/ mentor/     scoped portals
    api/                 route handlers
    register/ signin/    public
  components/            ui/ primitives, charts/, shell/, checkin/, judge/, mentor/
  lib/                   prisma, auth, authz, guards, analytics, email/, validation
  generated/prisma/      generated client — gitignored
```

### Judging weights

Six criteria, defined once in `src/lib/site.ts`, summing to 1:

| Criterion                   | Weight |
| --------------------------- | ------ |
| Agentic capability          | 25%    |
| Innovation                  | 20%    |
| Technical implementation    | 20%    |
| Problem relevance & clarity | 15%    |
| User experience             | 10%    |
| Demo & presentation         | 10%    |

The weighted total is computed **server-side** on submit. The slider UI shows a
running total as a preview only; if the two ever disagree, the stored value is
the server's. Reopening a team loads the existing score back into the form, so a
judge edits their own numbers instead of starting from blanks.

The judge list is sorted unscored-first and each rubric sits behind a native
`<details>`, so a judge with twenty assigned teams opens the portal to a
worklist rather than a wall of sliders. Unscored teams start expanded; scored
ones stay collapsed.

---

## Notes for whoever works on this next

**Schema isolation.** Everything lives in the `ops` Postgres schema, so it cannot
collide with the marketing site's `public` tables even while sharing a Neon
project. Point `DATABASE_URL` at a dedicated database for production.

**Prisma 7 specifics** — all three of these will bite otherwise:

- A driver adapter is required. `src/lib/prisma.ts` uses `@prisma/adapter-pg`.
- The generator is `prisma-client` with TypeScript output, so the client lands in
  `src/generated/prisma` and is imported as `@/generated/prisma/client`.
- **The `?schema=ops` URL parameter is ignored by the `pg` adapter.** The schema
  must also be passed to the adapter as `{ schema: "ops" }`. That covers ORM
  queries only — raw SQL is a separate problem, because Neon's pooler rejects
  `search_path` as a startup parameter, so the connection has no `search_path`
  and any `$queryRaw` must fully qualify `ops.table_name` and quote camelCase
  columns (`"qrToken"`).

**Prisma migrations on an existing table.** Adding a required column to a table
that already has rows is rejected. The fix is to write the migration by hand with
a `DEFAULT` so existing rows are backfilled — see
`migrations/*_assignment_notes/migration.sql` for the pattern.

**`prisma migrate dev` does not work here.** It refuses to run in a
non-interactive environment, and no flag changes that — not even `--create-only`.
Add a migration by writing `prisma/migrations/<timestamp>_<name>/migration.sql`
yourself, then `npm run db:deploy`. Two of the three checked-in migrations were
written this way. Migrations here are **unqualified** (`ALTER TABLE "teams" …`,
not `ops."teams"`) because `prisma migrate` *does* read the `?schema=ops`
parameter, unlike the driver adapter.

**Two registration paths exist.** `ops` and the marketing site each have their own
`POST /api/register`, writing to their own schema. That is why
`db:sync-registrations` exists — see
[Importing marketing-site registrations](#importing-marketing-site-registrations).
If you add a field to a team, check whether the sync script needs to map it too;
a field that exists on only one side will import as empty.

**Next 16 changes in use here:**

- `middleware.ts` is now `proxy.ts`, and the build reports it as `ƒ Proxy`.
- `params` and `searchParams` are async Promises in pages and route handlers.
- If the dev server is running when you change the Prisma schema, restart it.
  Turbopack caches the generated client and keeps serving the old shape, which
  shows up as `Unknown field 'x' for select statement` on a field that plainly
  exists in the schema. `prisma generate` alone will not clear it.

**Server/client boundary.** `authz.ts` and `authz-lite.ts` deliberately duplicate
the role and vertical labels: the former touches the database and is marked
`server-only`, the latter does not and is safe in client components. Same split
for `password.ts` and `password-core.ts`, so the seed can hash passwords outside
Next. If you add a label to one, add it to the other.

**Pages are server components.** Filters are GET forms with debounced URL
updates so every view works without JavaScript; client components exist only to
perform mutations and revalidate.
