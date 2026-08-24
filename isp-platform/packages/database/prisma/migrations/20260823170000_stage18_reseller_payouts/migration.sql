-- Stage 18: reseller commission payout lifecycle
CREATE TYPE "PayoutStatus" AS ENUM ('PENDING', 'APPROVED', 'PAID', 'REJECTED');
CREATE TABLE "reseller_payouts" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "reseller_id" TEXT NOT NULL,
  "amount" DECIMAL(14,4) NOT NULL,
  "status" "PayoutStatus" NOT NULL DEFAULT 'PENDING',
  "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approved_at" TIMESTAMP(3),
  "paid_at" TIMESTAMP(3),
  "processed_by" TEXT,
  "note" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "reseller_payouts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "reseller_payouts_organization_id_status_idx" ON "reseller_payouts"("organization_id", "status");
CREATE INDEX "reseller_payouts_reseller_id_created_at_idx" ON "reseller_payouts"("reseller_id", "created_at");
ALTER TABLE "reseller_payouts" ADD CONSTRAINT "reseller_payouts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reseller_payouts" ADD CONSTRAINT "reseller_payouts_reseller_id_fkey" FOREIGN KEY ("reseller_id") REFERENCES "reseller_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;