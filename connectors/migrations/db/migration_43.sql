-- Migration created on Jan 02, 2025
CREATE UNIQUE INDEX IF NOT EXISTS "zendesk_brands_connector_brand_idx" ON "zendesk_brands" ("connectorId", "brandId");
DROP INDEX IF EXISTS "zendesk_connector_brand_idx";
DROP INDEX IF EXISTS "zendesk_brands_brand_idx";
DROP INDEX IF EXISTS "zendesk_brands_brand_id";

CREATE UNIQUE INDEX IF NOT EXISTS "zendesk_categories_connector_brand_category_idx" ON "zendesk_categories" ("connectorId", "brandId", "categoryId");
CREATE INDEX IF NOT EXISTS "zendesk_categories_connector_brand_idx" ON "zendesk_categories" ("connectorId", "brandId");
DROP INDEX IF EXISTS "zendesk_connector_category_idx";
DROP INDEX IF EXISTS "zendesk_categories_category_id";

CREATE UNIQUE INDEX IF NOT EXISTS "zendesk_articles_connector_brand_article_idx" ON "zendesk_articles" ("connectorId", "brandId", "articleId");
CREATE INDEX IF NOT EXISTS "zendesk_articles_connector_brand_category_idx" ON "zendesk_articles" ("connectorId", "brandId", "categoryId");
CREATE INDEX IF NOT EXISTS "zendesk_articles_connector_brand_idx" ON "zendesk_articles" ("connectorId", "brandId");
DROP INDEX IF EXISTS "zendesk_connector_article_idx";
DROP INDEX IF EXISTS "zendesk_articles_article_id";

CREATE UNIQUE INDEX IF NOT EXISTS "zendesk_tickets_connector_brand_ticket_idx" ON "zendesk_tickets" ("connectorId", "brandId", "ticketId");
CREATE INDEX IF NOT EXISTS "zendesk_tickets_connector_brand_idx" ON "zendesk_tickets" ("connectorId", "brandId");
DROP INDEX IF EXISTS "zendesk_connector_ticket_idx";
DROP INDEX IF EXISTS "zendesk_tickets_ticket_id";
