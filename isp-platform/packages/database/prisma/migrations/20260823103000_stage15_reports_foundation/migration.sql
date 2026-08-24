-- Stage 15: Scheduled Reporting Foundations
CREATE TYPE "ReportType" AS ENUM ('SESSION_USAGE_CSV', 'USAGE_SUMMARY_CSV');
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

CREATE TABLE "reports" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "requested_by_user_id" TEXT NOT NULL,
  "type" "ReportType" NOT NULL,
  "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
  "window_start" TIMESTAMP(3) NOT NULL,
  "window_end" TIMESTAMP(3) NOT NULL,
  "file_name" TEXT NOT NULL,
  "content_type" TEXT NOT NULL DEFAULT 'text/csv',
  "content" TEXT,
  "row_count" INTEGER NOT NULL DEFAULT 0,
  "metadata" JSONB,
  "error" TEXT,
  "generated_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "reports_organization_id_idx" ON "reports"("organization_id");
CREATE INDEX "reports_organization_id_created_at_idx" ON "reports"("organization_id", "created_at");
CREATE INDEX "reports_organization_id_status_idx" ON "reports"("organization_id", "status");
CREATE INDEX "reports_requested_by_user_id_idx" ON "reports"("requested_by_user_id");

ALTER TABLE "reports"
  ADD CONSTRAINT "reports_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "reports"
  ADD CONSTRAINT "reports_requested_by_user_id_fkey"
  FOREIGN KEY ("requested_by_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
