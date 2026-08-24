-- Stage 15: Scheduled report execution and delivery
CREATE TYPE "ReportFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');
CREATE TYPE "ReportDeliveryChannel" AS ENUM ('IN_APP', 'EMAIL', 'WEBHOOK');
CREATE TYPE "ReportDeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

CREATE TABLE "scheduled_reports" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "created_by_user_id" TEXT NOT NULL,
  "type" "ReportType" NOT NULL,
  "frequency" "ReportFrequency" NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "next_run_at" TIMESTAMP(3) NOT NULL,
  "last_run_at" TIMESTAMP(3),
  "last_successful_run_at" TIMESTAMP(3),
  "last_status" "ReportStatus",
  "last_error" TEXT,
  "delivery_channel" "ReportDeliveryChannel" NOT NULL DEFAULT 'IN_APP',
  "delivery_target" TEXT,
  "claim_id" TEXT,
  "claimed_until" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "scheduled_reports_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "scheduled_reports_organization_id_idx" ON "scheduled_reports"("organization_id");
CREATE INDEX "scheduled_reports_organization_id_enabled_next_run_at_idx" ON "scheduled_reports"("organization_id", "enabled", "next_run_at");
CREATE INDEX "scheduled_reports_created_by_user_id_idx" ON "scheduled_reports"("created_by_user_id");
ALTER TABLE "scheduled_reports" ADD CONSTRAINT "scheduled_reports_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "scheduled_reports" ADD CONSTRAINT "scheduled_reports_created_by_user_id_fkey" FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "report_deliveries" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "report_id" TEXT NOT NULL,
  "channel" "ReportDeliveryChannel" NOT NULL,
  "target" TEXT,
  "status" "ReportDeliveryStatus" NOT NULL DEFAULT 'PENDING',
  "error" TEXT,
  "delivered_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "report_deliveries_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "report_deliveries_organization_id_created_at_idx" ON "report_deliveries"("organization_id", "created_at");
CREATE INDEX "report_deliveries_organization_id_status_idx" ON "report_deliveries"("organization_id", "status");
CREATE INDEX "report_deliveries_report_id_idx" ON "report_deliveries"("report_id");
ALTER TABLE "report_deliveries" ADD CONSTRAINT "report_deliveries_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "report_deliveries" ADD CONSTRAINT "report_deliveries_report_id_fkey" FOREIGN KEY ("report_id") REFERENCES "reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
