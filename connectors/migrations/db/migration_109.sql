-- Migration created on Dec 04, 2025
UPDATE "public"."slack_configurations"
SET "botEnabled" = false
WHERE "botEnabled" = true
AND "connectorId" IN (
  SELECT id FROM "connectors" WHERE "type" = 'slack'
);
