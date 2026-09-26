-- AlterTable
--
-- `updatedAt` is @updatedAt, so Prisma manages it going forward, but the column
-- still has to be NOT NULL for existing rows. Defaulting to now() backfills them
-- and leaves a sane value behind for the 55 assignments the seed created.
ALTER TABLE "assignments"
  ADD COLUMN "notes"     TEXT        NOT NULL DEFAULT '',
  ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
