-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'TEAM_LEAD', 'VOLUNTEER', 'JUDGE', 'MENTOR');

-- CreateEnum
CREATE TYPE "Vertical" AS ENUM ('SPONSORSHIP', 'MARKETING', 'TECHNICAL', 'PROBLEM_STATEMENTS', 'MENTOR_JUDGE_RELATIONS', 'LOGISTICS', 'MEDIA', 'VOLUNTEER_SUPPORT');

-- CreateEnum
CREATE TYPE "TeamStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CHECKED_IN', 'DISQUALIFIED', 'SUBMITTED');

-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('LEADER', 'MEMBER');

-- CreateEnum
CREATE TYPE "ScreeningStatus" AS ENUM ('PENDING', 'ADVANCE', 'NOT_ADVANCING');

-- CreateEnum
CREATE TYPE "CheckpointName" AS ENUM ('REGISTRATION', 'ROUND_1', 'ROUND_2', 'MIDNIGHT', 'SUBMISSION');

-- CreateEnum
CREATE TYPE "PanelKind" AS ENUM ('JUDGE', 'MENTOR');

-- CreateEnum
CREATE TYPE "SponsorTier" AS ENUM ('TITLE', 'GOLD', 'SILVER', 'BRONZE', 'TECHNOLOGY_PARTNER', 'PRIZE_IN_KIND');

-- CreateEnum
CREATE TYPE "SponsorStatus" AS ENUM ('LEAD', 'CONTACTED', 'NEGOTIATING', 'CONFIRMED', 'PAID');

-- CreateEnum
CREATE TYPE "VolunteerShift" AS ENUM ('MORNING', 'AFTERNOON', 'NIGHT', 'FULL_DAY');

-- CreateEnum
CREATE TYPE "Station" AS ENUM ('REGISTRATION_DESK', 'MENTOR_DESK', 'SUBMISSION_DESK', 'HELP_DESK');

-- CreateEnum
CREATE TYPE "CommType" AS ENUM ('CONFIRMATION', 'APPROVAL', 'WORKSHOP_REMINDER', 'PRE_EVENT_CHECKLIST', 'CHECKPOINT_REMINDER', 'FINALIST_ANNOUNCEMENT', 'RESULTS_CERTIFICATE', 'CUSTOM');

-- CreateEnum
CREATE TYPE "CommStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'OPENED', 'FAILED', 'BOUNCED');

-- CreateEnum
CREATE TYPE "AnalyticsEventType" AS ENUM ('PAGE_VIEW', 'FORM_START', 'FORM_STEP', 'FORM_ABANDON', 'FORM_COMPLETE');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT,
    "role" "Role" NOT NULL DEFAULT 'TEAM_LEAD',
    "vertical" "Vertical",
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "panel_members" (
    "id" TEXT NOT NULL,
    "kind" "PanelKind" NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "org" TEXT,
    "title" TEXT,
    "phone" TEXT,
    "confirmed" BOOLEAN NOT NULL DEFAULT false,
    "bio" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "panel_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" TEXT NOT NULL,
    "panelId" TEXT NOT NULL,
    "teamId" TEXT,
    "trackId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "volunteers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "shift" "VolunteerShift" NOT NULL DEFAULT 'MORNING',
    "station" "Station" NOT NULL DEFAULT 'REGISTRATION_DESK',
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "volunteers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tracks" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requirementChecklist" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "capacity" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teams" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "trackId" TEXT NOT NULL,
    "status" "TeamStatus" NOT NULL DEFAULT 'PENDING',
    "college" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT '',
    "contactName" TEXT NOT NULL DEFAULT '',
    "contactEmail" TEXT NOT NULL,
    "contactPhone" TEXT NOT NULL DEFAULT '',
    "projectIdea" TEXT NOT NULL DEFAULT '',
    "qrToken" TEXT NOT NULL,
    "disqualifiedReason" TEXT,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "participants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "college" TEXT NOT NULL,
    "year" TEXT NOT NULL DEFAULT '',
    "role" "ParticipantRole" NOT NULL DEFAULT 'MEMBER',
    "teamId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "participants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registration_drafts" (
    "id" TEXT NOT NULL,
    "resumeToken" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "step" INTEGER NOT NULL DEFAULT 0,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registration_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "submissions" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "githubRepoUrl" TEXT NOT NULL,
    "demoVideoUrl" TEXT NOT NULL,
    "architectureDiagramUrl" TEXT NOT NULL DEFAULT '',
    "apiDeclaration" TEXT NOT NULL DEFAULT '',
    "screeningStatus" "ScreeningStatus" NOT NULL DEFAULT 'PENDING',
    "screeningNotes" TEXT NOT NULL DEFAULT '',
    "screenedById" TEXT,
    "screenedAt" TIMESTAMP(3),
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lockedAt" TIMESTAMP(3),

    CONSTRAINT "submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scores" (
    "id" TEXT NOT NULL,
    "judgeId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "agenticCapability" INTEGER NOT NULL,
    "innovation" INTEGER NOT NULL,
    "technicalImplementation" INTEGER NOT NULL,
    "problemRelevance" INTEGER NOT NULL,
    "userExperience" INTEGER NOT NULL,
    "demoPresentation" INTEGER NOT NULL,
    "totalWeightedScore" DOUBLE PRECISION NOT NULL,
    "comments" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "checkpoint_logs" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "checkpoint" "CheckpointName" NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "notedBy" TEXT NOT NULL DEFAULT '',
    "scannedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checkpoint_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_templates" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "CommType" NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "communication_logs" (
    "id" TEXT NOT NULL,
    "type" "CommType" NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'email',
    "status" "CommStatus" NOT NULL DEFAULT 'QUEUED',
    "recipientEmail" TEXT NOT NULL,
    "recipientName" TEXT NOT NULL DEFAULT '',
    "teamId" TEXT,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "templateKey" TEXT,
    "providerId" TEXT,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "openedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentById" TEXT,

    CONSTRAINT "communication_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sponsors" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tier" "SponsorTier" NOT NULL DEFAULT 'BRONZE',
    "status" "SponsorStatus" NOT NULL DEFAULT 'LEAD',
    "contactPerson" TEXT NOT NULL DEFAULT '',
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "amount" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "ownerId" TEXT,
    "notes" TEXT NOT NULL DEFAULT '',
    "confirmedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sponsors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorEmail" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analytics_events" (
    "id" TEXT NOT NULL,
    "type" "AnalyticsEventType" NOT NULL,
    "path" TEXT NOT NULL DEFAULT '',
    "visitorId" TEXT NOT NULL DEFAULT '',
    "teamId" TEXT,
    "step" INTEGER,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analytics_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "panel_members_email_key" ON "panel_members"("email");

-- CreateIndex
CREATE UNIQUE INDEX "panel_members_userId_key" ON "panel_members"("userId");

-- CreateIndex
CREATE INDEX "assignments_panelId_idx" ON "assignments"("panelId");

-- CreateIndex
CREATE UNIQUE INDEX "assignments_panelId_teamId_trackId_key" ON "assignments"("panelId", "teamId", "trackId");

-- CreateIndex
CREATE INDEX "volunteers_station_shift_idx" ON "volunteers"("station", "shift");

-- CreateIndex
CREATE UNIQUE INDEX "tracks_slug_key" ON "tracks"("slug");

-- CreateIndex
CREATE INDEX "tracks_active_sortOrder_idx" ON "tracks"("active", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "teams_code_key" ON "teams"("code");

-- CreateIndex
CREATE UNIQUE INDEX "teams_qrToken_key" ON "teams"("qrToken");

-- CreateIndex
CREATE INDEX "teams_status_idx" ON "teams"("status");

-- CreateIndex
CREATE INDEX "teams_trackId_status_idx" ON "teams"("trackId", "status");

-- CreateIndex
CREATE INDEX "teams_college_idx" ON "teams"("college");

-- CreateIndex
CREATE INDEX "teams_createdAt_idx" ON "teams"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "participants_email_key" ON "participants"("email");

-- CreateIndex
CREATE INDEX "participants_teamId_idx" ON "participants"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "registration_drafts_resumeToken_key" ON "registration_drafts"("resumeToken");

-- CreateIndex
CREATE INDEX "registration_drafts_email_idx" ON "registration_drafts"("email");

-- CreateIndex
CREATE UNIQUE INDEX "submissions_teamId_key" ON "submissions"("teamId");

-- CreateIndex
CREATE INDEX "submissions_screeningStatus_idx" ON "submissions"("screeningStatus");

-- CreateIndex
CREATE INDEX "scores_teamId_idx" ON "scores"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "scores_judgeId_teamId_key" ON "scores"("judgeId", "teamId");

-- CreateIndex
CREATE INDEX "checkpoint_logs_teamId_checkpoint_idx" ON "checkpoint_logs"("teamId", "checkpoint");

-- CreateIndex
CREATE INDEX "checkpoint_logs_createdAt_idx" ON "checkpoint_logs"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "email_templates_key_key" ON "email_templates"("key");

-- CreateIndex
CREATE INDEX "communication_logs_status_type_idx" ON "communication_logs"("status", "type");

-- CreateIndex
CREATE INDEX "communication_logs_createdAt_idx" ON "communication_logs"("createdAt");

-- CreateIndex
CREATE INDEX "communication_logs_teamId_idx" ON "communication_logs"("teamId");

-- CreateIndex
CREATE INDEX "sponsors_status_tier_idx" ON "sponsors"("status", "tier");

-- CreateIndex
CREATE INDEX "audit_logs_entityType_entityId_idx" ON "audit_logs"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "analytics_events_type_createdAt_idx" ON "analytics_events"("type", "createdAt");

-- CreateIndex
CREATE INDEX "analytics_events_createdAt_idx" ON "analytics_events"("createdAt");

-- AddForeignKey
ALTER TABLE "panel_members" ADD CONSTRAINT "panel_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "panel_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "tracks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "volunteers" ADD CONSTRAINT "volunteers_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_trackId_fkey" FOREIGN KEY ("trackId") REFERENCES "tracks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "participants" ADD CONSTRAINT "participants_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_screenedById_fkey" FOREIGN KEY ("screenedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scores" ADD CONSTRAINT "scores_judgeId_fkey" FOREIGN KEY ("judgeId") REFERENCES "panel_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scores" ADD CONSTRAINT "scores_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoint_logs" ADD CONSTRAINT "checkpoint_logs_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "checkpoint_logs" ADD CONSTRAINT "checkpoint_logs_scannedById_fkey" FOREIGN KEY ("scannedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_logs" ADD CONSTRAINT "communication_logs_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "communication_logs" ADD CONSTRAINT "communication_logs_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sponsors" ADD CONSTRAINT "sponsors_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "teams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
