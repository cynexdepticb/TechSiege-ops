-- AlterTable
ALTER TABLE "participants"
ADD COLUMN "checkedIn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "checkedInAt" TIMESTAMP(3),
ADD COLUMN "checkedInBy" TEXT;

-- CreateIndex
CREATE INDEX "participants_checkedIn_idx" ON "participants"("checkedIn");
