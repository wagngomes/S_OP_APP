-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "ScenarioPhase" AS ENUM ('TEAM_SETUP', 'IMPORT_SETUP', 'CALCULATION', 'APPROVAL', 'COLLABORATION', 'CONSENSUS', 'PUBLICATION', 'ACCURACY');

-- CreateEnum
CREATE TYPE "FinalSayRole" AS ENUM ('CREATOR', 'APPROVER');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('CREATOR', 'APPROVER', 'COLLABORATOR');

-- CreateEnum
CREATE TYPE "ToleranceKind" AS ENUM ('ABSOLUTE', 'PERCENT');

-- CreateEnum
CREATE TYPE "IngestionKind" AS ENUM ('SALES_HISTORY', 'COLLABORATION_SHEET', 'ACTUAL_SALES');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "IssueCode" AS ENUM ('SEGMENT_COUNT_MISMATCH', 'MISSING_COLUMN', 'INVALID_NUMBER', 'INVALID_PERIOD', 'UNKNOWN_ITEM', 'ALIEN_ITEM', 'STRUCTURE_CHANGED');

-- CreateEnum
CREATE TYPE "AccuracyMetric" AS ENUM ('WMAPE', 'MAPE', 'BIAS');

-- CreateEnum
CREATE TYPE "ModelPackage" AS ENUM ('FAST', 'STANDARD', 'COMPLETE');

-- CreateEnum
CREATE TYPE "AdjustmentOrigin" AS ENUM ('UI', 'SPREADSHEET');

-- CreateEnum
CREATE TYPE "ConsensusSource" AS ENUM ('CALCULATED', 'COLLABORATED', 'MANUAL');

-- CreateEnum
CREATE TYPE "Coverage" AS ENUM ('BOTH', 'FORECAST_ONLY', 'ACTUAL_ONLY');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('PHASE_ADVANCED', 'PARAMETERS_CHANGED', 'FORECAST_PERSISTED', 'ADJUSTMENT_MADE', 'CONSENSUS_DECIDED', 'PUBLISHED', 'TEAM_CLOSED', 'APPROVAL_GRANTED', 'APPROVAL_RETURNED');

-- CreateEnum
CREATE TYPE "AuditOrigin" AS ENUM ('UI', 'SPREADSHEET', 'INGESTION', 'ENGINE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "EmailTemplate" AS ENUM ('FORECAST_READY', 'PHASE_ADVANCED', 'COLLABORATION_OPENED');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "emailVerifiedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "password" TEXT,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" UUID NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenarios" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "phase" "ScenarioPhase" NOT NULL DEFAULT 'TEAM_SETUP',
    "createdById" UUID NOT NULL,
    "finalSayRole" "FinalSayRole" NOT NULL DEFAULT 'CREATOR',
    "teamClosedAt" TIMESTAMPTZ,
    "forecastHorizonMonths" INTEGER NOT NULL DEFAULT 12,
    "consensusToleranceValue" DECIMAL(12,6),
    "consensusToleranceKind" "ToleranceKind",
    "publishedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenario_members" (
    "id" UUID NOT NULL,
    "scenarioId" UUID NOT NULL,
    "userId" UUID,
    "invitedEmail" TEXT NOT NULL,
    "role" "MemberRole" NOT NULL,
    "collaborationDoneAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scenario_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "segmentation_levels" (
    "id" UUID NOT NULL,
    "scenarioId" UUID NOT NULL,
    "position" INTEGER NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "segmentation_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_jobs" (
    "id" UUID NOT NULL,
    "scenarioId" UUID NOT NULL,
    "kind" "IngestionKind" NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "objectUri" TEXT NOT NULL,
    "declaredLabels" TEXT[],
    "totalRows" INTEGER NOT NULL DEFAULT 0,
    "validRows" INTEGER NOT NULL DEFAULT 0,
    "invalidRows" INTEGER NOT NULL DEFAULT 0,
    "issueCount" INTEGER NOT NULL DEFAULT 0,
    "issueCapReached" BOOLEAN NOT NULL DEFAULT false,
    "uploadedById" UUID NOT NULL,
    "correlationId" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ,
    "finishedAt" TIMESTAMPTZ,
    "failureReason" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ingestion_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_issues" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "lineNumber" INTEGER NOT NULL,
    "column" TEXT,
    "code" "IssueCode" NOT NULL,
    "detail" TEXT NOT NULL,

    CONSTRAINT "ingestion_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_records" (
    "id" UUID NOT NULL,
    "scenarioId" UUID NOT NULL,
    "productCode" TEXT NOT NULL,
    "segments" TEXT[],
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "sourceJobId" UUID NOT NULL,

    CONSTRAINT "sales_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "actual_sales_records" (
    "id" UUID NOT NULL,
    "scenarioId" UUID NOT NULL,
    "productCode" TEXT NOT NULL,
    "segments" TEXT[],
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "sourceJobId" UUID NOT NULL,

    CONSTRAINT "actual_sales_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forecast_parameters" (
    "id" UUID NOT NULL,
    "scenarioId" UUID NOT NULL,
    "groupingLevelIds" UUID[],
    "prorationMonths" INTEGER NOT NULL,
    "accuracyMetric" "AccuracyMetric" NOT NULL DEFAULT 'WMAPE',
    "modelPackage" "ModelPackage" NOT NULL,
    "horizonMonths" INTEGER NOT NULL DEFAULT 12,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "forecast_parameters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forecast_jobs" (
    "id" UUID NOT NULL,
    "scenarioId" UUID NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "parametersSnapshot" JSONB NOT NULL,
    "modelCatalogVersion" TEXT NOT NULL,
    "seriesCount" INTEGER NOT NULL DEFAULT 0,
    "inputUri" TEXT,
    "outputUri" TEXT,
    "requestedById" UUID NOT NULL,
    "correlationId" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ,
    "finishedAt" TIMESTAMPTZ,
    "failureReason" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "forecast_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forecast_series_results" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "seriesKey" TEXT NOT NULL,
    "winningModel" TEXT NOT NULL,
    "evaluatedModels" JSONB NOT NULL,
    "metricValue" DECIMAL(12,6) NOT NULL,
    "otherMetrics" JSONB,
    "fallbackApplied" BOOLEAN NOT NULL DEFAULT false,
    "backtestWindowsUsed" INTEGER NOT NULL,
    "excludedModels" JSONB,

    CONSTRAINT "forecast_series_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "forecast_items" (
    "id" UUID NOT NULL,
    "jobId" UUID NOT NULL,
    "scenarioId" UUID NOT NULL,
    "productCode" TEXT NOT NULL,
    "segments" TEXT[],
    "seriesKey" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "calculatedQuantity" DECIMAL(18,6) NOT NULL,

    CONSTRAINT "forecast_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collaboration_adjustments" (
    "id" UUID NOT NULL,
    "scenarioId" UUID NOT NULL,
    "forecastItemId" UUID NOT NULL,
    "authorId" UUID NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "reason" TEXT NOT NULL,
    "origin" "AdjustmentOrigin" NOT NULL,
    "supersededById" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collaboration_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consensus_decisions" (
    "id" UUID NOT NULL,
    "forecastItemId" UUID NOT NULL,
    "decidedById" UUID NOT NULL,
    "source" "ConsensusSource" NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "reason" TEXT,
    "deltaToCalculated" DECIMAL(18,6) NOT NULL,
    "deltaToCollaborated" DECIMAL(18,6),
    "decidedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consensus_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "published_forecasts" (
    "id" UUID NOT NULL,
    "scenarioId" UUID NOT NULL,
    "forecastItemId" UUID NOT NULL,
    "quantity" DECIMAL(18,6) NOT NULL,
    "publishedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "published_forecasts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accuracy_runs" (
    "id" UUID NOT NULL,
    "scenarioId" UUID NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "dimensionLevelIds" UUID[],
    "includeProduct" BOOLEAN NOT NULL DEFAULT false,
    "metric" "AccuracyMetric" NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "inputUri" TEXT,
    "outputUri" TEXT,
    "correlationId" TEXT NOT NULL,
    "startedAt" TIMESTAMPTZ,
    "finishedAt" TIMESTAMPTZ,
    "failureReason" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accuracy_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accuracy_results" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "dimensionKey" TEXT NOT NULL,
    "publishedQuantity" DECIMAL(18,6) NOT NULL,
    "actualQuantity" DECIMAL(18,6) NOT NULL,
    "metricValue" DECIMAL(12,6),
    "coverage" "Coverage" NOT NULL,

    CONSTRAINT "accuracy_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_events" (
    "id" UUID NOT NULL,
    "scenarioId" UUID NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" UUID NOT NULL,
    "action" "AuditAction" NOT NULL,
    "actorId" UUID,
    "origin" "AuditOrigin" NOT NULL,
    "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "correlationId" TEXT NOT NULL,
    "payload" JSONB,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_notifications" (
    "id" UUID NOT NULL,
    "scenarioId" UUID NOT NULL,
    "recipientEmail" TEXT NOT NULL,
    "template" "EmailTemplate" NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "providerMessageId" TEXT,
    "lastError" TEXT,
    "correlationId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMPTZ,

    CONSTRAINT "email_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "sessions"("userId");

-- CreateIndex
CREATE INDEX "accounts_userId_idx" ON "accounts"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "accounts_providerId_accountId_key" ON "accounts"("providerId", "accountId");

-- CreateIndex
CREATE INDEX "verifications_identifier_idx" ON "verifications"("identifier");

-- CreateIndex
CREATE INDEX "scenarios_createdById_idx" ON "scenarios"("createdById");

-- CreateIndex
CREATE INDEX "scenarios_phase_idx" ON "scenarios"("phase");

-- CreateIndex
CREATE INDEX "scenario_members_userId_idx" ON "scenario_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "scenario_members_scenarioId_invitedEmail_role_key" ON "scenario_members"("scenarioId", "invitedEmail", "role");

-- CreateIndex
CREATE UNIQUE INDEX "segmentation_levels_scenarioId_position_key" ON "segmentation_levels"("scenarioId", "position");

-- CreateIndex
CREATE UNIQUE INDEX "segmentation_levels_scenarioId_label_key" ON "segmentation_levels"("scenarioId", "label");

-- CreateIndex
CREATE INDEX "ingestion_jobs_scenarioId_status_idx" ON "ingestion_jobs"("scenarioId", "status");

-- CreateIndex
CREATE INDEX "ingestion_issues_jobId_lineNumber_idx" ON "ingestion_issues"("jobId", "lineNumber");

-- CreateIndex
CREATE INDEX "sales_records_scenarioId_year_month_idx" ON "sales_records"("scenarioId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "sales_records_scenarioId_productCode_segments_year_month_key" ON "sales_records"("scenarioId", "productCode", "segments", "year", "month");

-- CreateIndex
CREATE INDEX "actual_sales_records_scenarioId_year_month_idx" ON "actual_sales_records"("scenarioId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "actual_sales_records_scenarioId_productCode_segments_year_m_key" ON "actual_sales_records"("scenarioId", "productCode", "segments", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "forecast_parameters_scenarioId_key" ON "forecast_parameters"("scenarioId");

-- CreateIndex
CREATE INDEX "forecast_jobs_scenarioId_status_idx" ON "forecast_jobs"("scenarioId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "forecast_series_results_jobId_seriesKey_key" ON "forecast_series_results"("jobId", "seriesKey");

-- CreateIndex
CREATE INDEX "forecast_items_scenarioId_year_month_idx" ON "forecast_items"("scenarioId", "year", "month");

-- CreateIndex
CREATE INDEX "forecast_items_jobId_seriesKey_idx" ON "forecast_items"("jobId", "seriesKey");

-- CreateIndex
CREATE UNIQUE INDEX "forecast_items_jobId_productCode_segments_year_month_key" ON "forecast_items"("jobId", "productCode", "segments", "year", "month");

-- CreateIndex
CREATE INDEX "collaboration_adjustments_forecastItemId_createdAt_idx" ON "collaboration_adjustments"("forecastItemId", "createdAt");

-- CreateIndex
CREATE INDEX "collaboration_adjustments_scenarioId_authorId_idx" ON "collaboration_adjustments"("scenarioId", "authorId");

-- CreateIndex
CREATE UNIQUE INDEX "consensus_decisions_forecastItemId_key" ON "consensus_decisions"("forecastItemId");

-- CreateIndex
CREATE UNIQUE INDEX "published_forecasts_forecastItemId_key" ON "published_forecasts"("forecastItemId");

-- CreateIndex
CREATE INDEX "published_forecasts_scenarioId_idx" ON "published_forecasts"("scenarioId");

-- CreateIndex
CREATE UNIQUE INDEX "accuracy_runs_scenarioId_dimensionLevelIds_includeProduct_m_key" ON "accuracy_runs"("scenarioId", "dimensionLevelIds", "includeProduct", "metric", "periodYear", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "accuracy_results_runId_dimensionKey_key" ON "accuracy_results"("runId", "dimensionKey");

-- CreateIndex
CREATE INDEX "audit_events_scenarioId_occurredAt_idx" ON "audit_events"("scenarioId", "occurredAt");

-- CreateIndex
CREATE INDEX "audit_events_entityType_entityId_idx" ON "audit_events"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "email_notifications_scenarioId_status_idx" ON "email_notifications"("scenarioId", "status");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenarios" ADD CONSTRAINT "scenarios_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenario_members" ADD CONSTRAINT "scenario_members_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenario_members" ADD CONSTRAINT "scenario_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "segmentation_levels" ADD CONSTRAINT "segmentation_levels_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_jobs" ADD CONSTRAINT "ingestion_jobs_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_issues" ADD CONSTRAINT "ingestion_issues_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ingestion_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_records" ADD CONSTRAINT "sales_records_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_records" ADD CONSTRAINT "sales_records_sourceJobId_fkey" FOREIGN KEY ("sourceJobId") REFERENCES "ingestion_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actual_sales_records" ADD CONSTRAINT "actual_sales_records_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "actual_sales_records" ADD CONSTRAINT "actual_sales_records_sourceJobId_fkey" FOREIGN KEY ("sourceJobId") REFERENCES "ingestion_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecast_parameters" ADD CONSTRAINT "forecast_parameters_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecast_jobs" ADD CONSTRAINT "forecast_jobs_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecast_jobs" ADD CONSTRAINT "forecast_jobs_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecast_series_results" ADD CONSTRAINT "forecast_series_results_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "forecast_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "forecast_items" ADD CONSTRAINT "forecast_items_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "forecast_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_adjustments" ADD CONSTRAINT "collaboration_adjustments_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_adjustments" ADD CONSTRAINT "collaboration_adjustments_forecastItemId_fkey" FOREIGN KEY ("forecastItemId") REFERENCES "forecast_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_adjustments" ADD CONSTRAINT "collaboration_adjustments_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_adjustments" ADD CONSTRAINT "collaboration_adjustments_supersededById_fkey" FOREIGN KEY ("supersededById") REFERENCES "collaboration_adjustments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consensus_decisions" ADD CONSTRAINT "consensus_decisions_forecastItemId_fkey" FOREIGN KEY ("forecastItemId") REFERENCES "forecast_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consensus_decisions" ADD CONSTRAINT "consensus_decisions_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "published_forecasts" ADD CONSTRAINT "published_forecasts_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "published_forecasts" ADD CONSTRAINT "published_forecasts_forecastItemId_fkey" FOREIGN KEY ("forecastItemId") REFERENCES "forecast_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accuracy_runs" ADD CONSTRAINT "accuracy_runs_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accuracy_results" ADD CONSTRAINT "accuracy_results_runId_fkey" FOREIGN KEY ("runId") REFERENCES "accuracy_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "email_notifications" ADD CONSTRAINT "email_notifications_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "scenarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

