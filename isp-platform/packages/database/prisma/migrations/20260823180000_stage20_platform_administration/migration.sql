-- Stage 20: organization feature flags
CREATE TABLE "organization_feature_flags" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "updated_by" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "organization_feature_flags_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "organization_feature_flags_organization_id_key_key" ON "organization_feature_flags"("organization_id", "key");
CREATE INDEX "organization_feature_flags_organization_id_enabled_idx" ON "organization_feature_flags"("organization_id", "enabled");
ALTER TABLE "organization_feature_flags" ADD CONSTRAINT "organization_feature_flags_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;