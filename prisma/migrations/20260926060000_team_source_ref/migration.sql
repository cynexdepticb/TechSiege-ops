-- AlterTable
--
-- `sourceRef` holds the marketing site's `public.teams.id` UUID for teams
-- imported by scripts/sync-registrations.ts. It gives the import a stable
-- idempotency key (the marketing site allows duplicate team names, so the name
-- is not a usable key) and records a team's provenance.
--
-- Nullable, so teams created through the ops app itself are unaffected, and a
-- partial-style unique index still permits any number of NULLs in Postgres.
ALTER TABLE "teams" ADD COLUMN "sourceRef" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "teams_sourceRef_key" ON "teams"("sourceRef");
