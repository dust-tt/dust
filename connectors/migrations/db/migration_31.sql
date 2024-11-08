-- Migration created on Nov 07, 2024
ALTER TABLE "zendesk_tickets" ALTER COLUMN "groupId" DROP NOT NULL;ALTER TABLE "zendesk_tickets" ALTER COLUMN "groupId" DROP DEFAULT;
ALTER TABLE "zendesk_tickets" ALTER COLUMN "assigneeId" DROP NOT NULL;ALTER TABLE "zendesk_tickets" ALTER COLUMN "assigneeId" DROP DEFAULT;
ALTER TABLE "zendesk_tickets" ALTER COLUMN "organizationId" DROP NOT NULL;ALTER TABLE "zendesk_tickets" ALTER COLUMN "organizationId" DROP DEFAULT;
ALTER TABLE "public"."zendesk_tickets" RENAME COLUMN "name" TO "subject";
ALTER TABLE "public"."zendesk_tickets" DROP COLUMN "satisfactionScore";
ALTER TABLE "public"."zendesk_tickets" DROP COLUMN "satisfactionComment";
ALTER TABLE "public"."zendesk_tickets" DROP COLUMN "description";
ALTER TABLE "public"."zendesk_tickets" DROP COLUMN "requesterMail";
ALTER TABLE "public"."zendesk_tickets" DROP COLUMN "status";
ALTER TABLE "public"."zendesk_tickets" DROP COLUMN "tags";
ALTER TABLE "public"."zendesk_tickets" DROP COLUMN "type";
ALTER TABLE "public"."zendesk_tickets" DROP COLUMN "customFields";