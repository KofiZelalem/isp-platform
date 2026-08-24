-- Stage 17: retry-safe notification delivery attempts
ALTER TABLE "notifications"
  ADD COLUMN "retry_of_id" TEXT,
  ADD COLUMN "retry_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "last_retry_at" TIMESTAMP(3);

CREATE INDEX "notifications_organization_id_retry_of_id_idx"
  ON "notifications"("organization_id", "retry_of_id");

ALTER TABLE "notifications"
  ADD CONSTRAINT "notifications_retry_of_id_fkey"
  FOREIGN KEY ("retry_of_id") REFERENCES "notifications"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;