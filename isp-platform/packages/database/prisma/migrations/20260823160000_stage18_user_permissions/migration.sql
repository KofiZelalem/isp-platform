-- Stage 18: tenant user permissions
ALTER TABLE "users" ADD COLUMN "permissions" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];