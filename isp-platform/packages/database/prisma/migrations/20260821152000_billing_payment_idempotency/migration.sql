ALTER TABLE "payments"
  ADD COLUMN "internal_reference" TEXT,
  ADD COLUMN "subscription_id" TEXT,
  ADD COLUMN "payment_method" TEXT,
  ADD COLUMN "failure_reason" TEXT;

UPDATE "payments"
SET "internal_reference" = 'legacy_' || "id"
WHERE "internal_reference" IS NULL;

ALTER TABLE "payments"
  ALTER COLUMN "internal_reference" SET NOT NULL;

CREATE UNIQUE INDEX "payments_internal_reference_key"
  ON "payments"("internal_reference");

CREATE INDEX "payments_organization_id_status_idx"
  ON "payments"("organization_id", "status");

ALTER TABLE "payments"
  ADD CONSTRAINT "payments_subscription_id_fkey"
  FOREIGN KEY ("subscription_id") REFERENCES "subscriptions"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "payments_subscription_id_idx"
  ON "payments"("subscription_id");