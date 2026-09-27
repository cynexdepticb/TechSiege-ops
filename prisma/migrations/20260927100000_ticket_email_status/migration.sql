-- CreateEnum
--
-- Delivery state of the one confirmation email that carries every member's
-- ticket after payment verification. Lives on the team row: one email per
-- team, so a separate table would be a join in search of a purpose. FAILED is
-- terminal until an organiser re-sends; the tickets themselves are unchanged.
CREATE TYPE "TicketEmailStatus" AS ENUM ('NOT_SENT', 'SENT', 'FAILED');

-- AlterTable
--
-- `ticketEmailStatus` replaces a boolean "did it work" — NOT_SENT must be
-- distinguishable from FAILED, because the organiser actions differ: one means
-- the send was never attempted (or the payment is still unverified), the other
-- means tickets exist and need a re-send.
-- `ticketEmailLastError` keeps the SMTP rejection beside the status so the
-- team page can say why the delivery failed without a comms-log dig.
-- `ticketSentAt` already records the successful-send timestamp and is kept.
ALTER TABLE "teams"
ADD COLUMN "ticketEmailStatus" "TicketEmailStatus" NOT NULL DEFAULT 'NOT_SENT',
ADD COLUMN "ticketEmailLastError" TEXT NOT NULL DEFAULT '';

-- Backfill
--
-- A team that already has a ticket-send timestamp had a successful send, by
-- definition: the code only stamps `ticketSentAt` after a copy left. Marking
-- those SENT keeps the backfill honest instead of retro-failing history.
UPDATE "teams" SET "ticketEmailStatus" = 'SENT' WHERE "ticketSentAt" IS NOT NULL;

-- CreateIndex
--
-- The "email failed, needs a re-send" queue is the main operational filter over
-- this column — the desk works that list after any mail outage.
CREATE INDEX "teams_ticketEmailStatus_idx" ON "teams"("ticketEmailStatus");
