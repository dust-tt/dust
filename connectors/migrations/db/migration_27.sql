-- Migration created on Oct 23, 2024
CREATE TABLE IF NOT EXISTS "zendesk_brands"
(
    "id"             SERIAL,
    "createdAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "brandId"        INTEGER                  NOT NULL,
    "name"           VARCHAR(255)             NOT NULL,
    "url"            VARCHAR(255)             NOT NULL,
    "subdomain"      VARCHAR(255)             NOT NULL,
    "permission"     VARCHAR(255)             NOT NULL,
    "hasHelpCenter"  BOOLEAN                  NOT NULL,
    "lastUpsertedTs" TIMESTAMP WITH TIME ZONE,
    "connectorId"    INTEGER                  NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE INDEX "zendesk_brands_connector_id" ON "zendesk_brands" ("connectorId");
CREATE UNIQUE INDEX "zendesk_connector_brand_idx" ON "zendesk_brands" ("connectorId", "brandId");
CREATE INDEX "zendesk_brands_brand_id" ON "zendesk_brands" ("brandId");

CREATE TABLE IF NOT EXISTS "zendesk_categories"
(
    "id"             SERIAL,
    "createdAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "categoryId"     INTEGER                  NOT NULL,
    "brandId"        INTEGER                  NOT NULL,
    "name"           VARCHAR(255)             NOT NULL,
    "url"            VARCHAR(255)             NOT NULL,
    "permission"     VARCHAR(255)             NOT NULL,
    "lastUpsertedTs" TIMESTAMP WITH TIME ZONE,
    "connectorId"    INTEGER                  NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "zendesk_connector_category_idx" ON "zendesk_categories" ("connectorId", "categoryId");
CREATE INDEX "zendesk_categories_category_id" ON "zendesk_categories" ("categoryId");
CREATE INDEX "zendesk_categories_connector_id" ON "zendesk_categories" ("connectorId");

CREATE TABLE IF NOT EXISTS "zendesk_articles"
(
    "id"             SERIAL,
    "createdAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"      TIMESTAMP WITH TIME ZONE NOT NULL,
    "articleId"      INTEGER                  NOT NULL,
    "brandId"        INTEGER                  NOT NULL,
    "categoryId"     INTEGER                  NOT NULL,
    "name"           VARCHAR(255)             NOT NULL,
    "url"            VARCHAR(255)             NOT NULL,
    "permission"     VARCHAR(255)             NOT NULL,
    "lastUpsertedTs" TIMESTAMP WITH TIME ZONE,
    "connectorId"    INTEGER                  NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "zendesk_connector_article_idx" ON "zendesk_articles" ("connectorId", "articleId");
CREATE INDEX "zendesk_articles_article_id" ON "zendesk_articles" ("articleId");
CREATE INDEX "zendesk_articles_connector_id" ON "zendesk_articles" ("connectorId");

CREATE TABLE IF NOT EXISTS "zendesk_tickets"
(
    "id"                  SERIAL,
    "createdAt"           TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt"           TIMESTAMP WITH TIME ZONE NOT NULL,
    "ticketId"            INTEGER                  NOT NULL,
    "brandId"             INTEGER                  NOT NULL,
    "groupId"             INTEGER                  NOT NULL,
    "assigneeId"          INTEGER                  NOT NULL,
    "organizationId"      INTEGER                  NOT NULL,
    "name"                VARCHAR(255)             NOT NULL,
    "satisfactionScore"   VARCHAR(255)             NOT NULL,
    "satisfactionComment" VARCHAR(255),
    "subject"             VARCHAR(255)             NOT NULL,
    "description"         VARCHAR(255)             NOT NULL,
    "requesterMail"       VARCHAR(255)             NOT NULL,
    "status"              VARCHAR(255)             NOT NULL,
    "tags"                VARCHAR(255)[]           NOT NULL,
    "url"                 VARCHAR(255)             NOT NULL,
    "type"                VARCHAR(255)             NOT NULL,
    "customFields"        VARCHAR(255)[]           NOT NULL DEFAULT ARRAY []::VARCHAR(255)[],
    "permission"          VARCHAR(255)             NOT NULL,
    "lastUpsertedTs"      TIMESTAMP WITH TIME ZONE,
    "connectorId"         INTEGER                  NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "zendesk_connector_ticket_idx" ON "zendesk_tickets" ("connectorId", "ticketId");
CREATE INDEX "zendesk_tickets_ticket_id" ON "zendesk_tickets" ("ticketId");
CREATE INDEX "zendesk_tickets_connector_id" ON "zendesk_tickets" ("connectorId");
