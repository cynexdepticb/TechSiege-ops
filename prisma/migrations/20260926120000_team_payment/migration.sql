-- CreateEnum
--
-- Entry-fee state, kept separate from TeamStatus so "who still owes money" stays
-- answerable without a second source of truth. Every existing team defaults to
-- UNPAID, which is the honest starting position: no fee has been confirmed for
-- anyone yet, and the ops team works through the list.
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PAID');

-- AlterEnum
--
-- Two new communication types for the post-payment flow. PAYMENT_ACKNOWLEDGEMENT
-- fires the moment an organiser confirms the transfer; TICKET_ISSUED is the
-- separate, later email that carries the check-in QR. They are distinct events
-- with distinct audiences-in-time, so they get distinct rows in the comms log
-- rather than one template sent twice.
--
-- PG 12+ permits ADD VALUE inside a transaction as long as the new value is not
-- used in the same transaction, which holds here.
ALTER TYPE "CommType" ADD VALUE IF NOT EXISTS 'PAYMENT_ACKNOWLEDGEMENT';
ALTER TYPE "CommType" ADD VALUE IF NOT EXISTS 'TICKET_ISSUED';

-- AlterTable
--
-- `amountPaid` is nullable rather than defaulted: a team confirmed as paid via
-- cash with no figure recorded should stay null instead of implying ₹0.
-- `ticketSentAt` records the last ticket email so a re-send is visible in the UI
-- and in the comms log rather than looking like the first send.
ALTER TABLE "teams"
ADD COLUMN "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
ADD COLUMN "amountPaid" DECIMAL(12,2),
ADD COLUMN "paymentRef" TEXT NOT NULL DEFAULT '',
ADD COLUMN "paidAt" TIMESTAMP(3),
ADD COLUMN "ticketSentAt" TIMESTAMP(3),
ADD COLUMN "paidById" TEXT;

-- CreateIndex
--
-- The payment list is a filter over every team, so it gets its own index rather
-- than riding along with the existing status index.
CREATE INDEX "teams_paymentStatus_idx" ON "teams"("paymentStatus");

-- AddForeignKey
--
-- SET NULL, matching communication_logs.sentById: losing the staff account that
-- confirmed a payment must never delete the payment record itself.
ALTER TABLE "teams" ADD CONSTRAINT "teams_paidById_fkey" FOREIGN KEY ("paidById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
