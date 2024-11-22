-- Migration created on Nov 22, 2024
ALTER TABLE "zendesk_brands" ALTER COLUMN "url" TYPE TEXT;
ALTER TABLE "zendesk_categories" ALTER COLUMN "name" TYPE TEXT;
ALTER TABLE "zendesk_categories" ALTER COLUMN "url" TYPE TEXT;
ALTER TABLE "zendesk_articles" ALTER COLUMN "name" TYPE TEXT;
ALTER TABLE "zendesk_articles" ALTER COLUMN "url" TYPE TEXT;
ALTER TABLE "public"."zendesk_tickets" DROP COLUMN "groupId";
ALTER TABLE "public"."zendesk_tickets" DROP COLUMN "assigneeId";
ALTER TABLE "public"."zendesk_tickets" DROP COLUMN "organizationId";
ALTER TABLE "zendesk_tickets" ALTER COLUMN "url" TYPE TEXT;
