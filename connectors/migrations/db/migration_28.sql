-- Migration created on Oct 23, 2024
ALTER TABLE "zendesk_brands"
    DROP COLUMN "permission";
ALTER TABLE "zendesk_brands"
    ADD COLUMN "helpCenterPermission" VARCHAR(255) NOT NULL DEFAULT 'none';
ALTER TABLE "zendesk_brands"
    ADD COLUMN "ticketsPermission" VARCHAR(255) NOT NULL DEFAULT 'none';
