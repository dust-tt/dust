-- Migration created on Nov 22, 2024
ALTER TABLE "zendesk_tickets" DROP COLUMN "assigneeId";
ALTER TABLE "zendesk_tickets" DROP COLUMN "groupId";
ALTER TABLE "zendesk_tickets" DROP COLUMN "organizationId";
