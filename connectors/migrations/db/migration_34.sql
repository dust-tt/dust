-- Migration created on Nov 14, 2024
ALTER TABLE "public"."zendesk_categories" ALTER COLUMN "description" TYPE TEXT;
ALTER TABLE "public"."zendesk_tickets" ALTER COLUMN "subject" TYPE TEXT;
