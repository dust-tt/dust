-- Migration created on Oct 31, 2024
ALTER TABLE "zendesk_brands"
    ALTER COLUMN "brandId" TYPE BIGINT;
ALTER TABLE "zendesk_categories"
    ALTER COLUMN "categoryId" TYPE BIGINT;
ALTER TABLE "zendesk_categories"
    ALTER COLUMN "brandId" TYPE BIGINT;
ALTER TABLE "zendesk_articles"
    ALTER COLUMN "articleId" TYPE BIGINT;
ALTER TABLE "zendesk_articles"
    ALTER COLUMN "brandId" TYPE BIGINT;
ALTER TABLE "zendesk_articles"
    ALTER COLUMN "categoryId" TYPE BIGINT;
ALTER TABLE "zendesk_tickets"
    ALTER COLUMN "ticketId" TYPE BIGINT;
ALTER TABLE "zendesk_tickets"
    ALTER COLUMN "brandId" TYPE BIGINT;
ALTER TABLE "zendesk_tickets"
    ALTER COLUMN "groupId" TYPE BIGINT;
ALTER TABLE "zendesk_tickets"
    ALTER COLUMN "assigneeId" TYPE BIGINT;
ALTER TABLE "zendesk_tickets"
    ALTER COLUMN "organizationId" TYPE BIGINT;

ALTER TABLE "zendesk_categories"
    ADD COLUMN "description" VARCHAR(255);
