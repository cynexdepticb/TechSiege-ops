-- AlterTable
ALTER TABLE "participants"
ADD COLUMN "ticketId" TEXT,
ADD COLUMN "qrToken" TEXT,
ADD COLUMN "pdfFilename" TEXT,
ADD COLUMN "pdfPath" TEXT,
ADD COLUMN "pdfGeneratedAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "participants_ticketId_key" ON "participants"("ticketId");

-- CreateIndex
CREATE UNIQUE INDEX "participants_qrToken_key" ON "participants"("qrToken");

-- CreateIndex
CREATE INDEX "participants_ticketId_idx" ON "participants"("ticketId");

-- CreateIndex
CREATE INDEX "participants_qrToken_idx" ON "participants"("qrToken");
