-- Stage 17: tenant notification provider configuration
ALTER TABLE "organization_settings"
  ADD COLUMN "notification_email_provider" TEXT,
  ADD COLUMN "notification_email_api_key_enc" TEXT,
  ADD COLUMN "notification_email_from" TEXT,
  ADD COLUMN "notification_sms_provider" TEXT,
  ADD COLUMN "notification_sms_api_key_enc" TEXT,
  ADD COLUMN "notification_sms_sender" TEXT;
