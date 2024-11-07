-- Migration created on Nov 07, 2024
ALTER TABLE "zendesk_tickets" ALTER COLUMN "organizationId" DROP NOT NULL;ALTER TABLE "zendesk_tickets" ALTER COLUMN "organizationId" DROP DEFAULT;ALTER TABLE "zendesk_tickets" ALTER COLUMN "organizationId" TYPE BIGINT;
