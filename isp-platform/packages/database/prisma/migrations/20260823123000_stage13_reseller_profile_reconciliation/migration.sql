-- Stage 13: consolidate legacy resellers into canonical ResellerProfile.
-- Preserve legacy IDs where possible so existing foreign-key values remain stable.
INSERT INTO "reseller_profiles" ("id", "user_id", "organization_id", "commission_rate", "wallet_balance", "created_at", "updated_at")
SELECT r."id", r."user_id", r."organization_id", r."commission_rate", 0, r."created_at", r."updated_at"
FROM "resellers" r
WHERE NOT EXISTS (
  SELECT 1 FROM "reseller_profiles" p WHERE p."user_id" = r."user_id"
);

UPDATE "subscribers" s
SET "reseller_id" = p."id"
FROM "resellers" r
JOIN "reseller_profiles" p ON p."user_id" = r."user_id"
WHERE s."reseller_id" = r."id";

UPDATE "wallets" w
SET "reseller_id" = p."id"
FROM "resellers" r
JOIN "reseller_profiles" p ON p."user_id" = r."user_id"
WHERE w."reseller_id" = r."id";

ALTER TABLE "subscribers"
  ADD CONSTRAINT "subscribers_reseller_id_fkey"
  FOREIGN KEY ("reseller_id") REFERENCES "reseller_profiles"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "wallets"
  ADD CONSTRAINT "wallets_reseller_id_fkey"
  FOREIGN KEY ("reseller_id") REFERENCES "reseller_profiles"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

DO $$
DECLARE constraint_record RECORD;
BEGIN
  FOR constraint_record IN
    SELECT n.nspname AS schema_name, c.relname AS table_name, con.conname AS constraint_name
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname IN ('resellers', 'subscribers', 'wallets')
      AND con.confrelid = 'resellers'::regclass
  LOOP
    EXECUTE format('ALTER TABLE %I.%I DROP CONSTRAINT %I', constraint_record.schema_name, constraint_record.table_name, constraint_record.constraint_name);
  END LOOP;
END $$;

DROP TABLE "resellers";
