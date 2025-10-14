-- Create microsoft_bot_configurations table

CREATE TABLE IF NOT EXISTS "microsoft_bot_configurations" (
    "id" BIGSERIAL , 
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, 
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, 
    "botEnabled" BOOLEAN NOT NULL DEFAULT false, 
    "tenantId" VARCHAR(255) NOT NULL, 
    "connectorId" BIGINT NOT NULL REFERENCES "connectors" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "microsoft_bot_configurations_connectorId_idx" ON "microsoft_bot_configurations" ("connectorId");

CREATE UNIQUE INDEX "microsoft_bot_configurations_tenantId_idx" ON "microsoft_bot_configurations" ("tenantId");
-- Migration created on Oct 14, 2025
