-- Stage 18: tenant-scoped staff and reseller invitations
CREATE TYPE "InvitationRole" AS ENUM ('STAFF', 'RESELLER');
CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED');

CREATE TABLE "invitations" (
  "id" TEXT NOT NULL,
  "organization_id" TEXT NOT NULL,
  "invited_by_user_id" TEXT NOT NULL,
  "accepted_user_id" TEXT,
  "email" TEXT NOT NULL,
  "role" "InvitationRole" NOT NULL,
  "token_hash" TEXT NOT NULL,
  "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
  "expires_at" TIMESTAMP(3) NOT NULL,
  "accepted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "invitations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "invitations_accepted_user_id_key" ON "invitations"("accepted_user_id");
CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");
CREATE UNIQUE INDEX "invitations_organization_id_email_status_key" ON "invitations"("organization_id", "email", "status");
CREATE INDEX "invitations_organization_id_status_idx" ON "invitations"("organization_id", "status");
CREATE INDEX "invitations_organization_id_expires_at_idx" ON "invitations"("organization_id", "expires_at");
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_invited_by_user_id_fkey" FOREIGN KEY ("invited_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_accepted_user_id_fkey" FOREIGN KEY ("accepted_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
