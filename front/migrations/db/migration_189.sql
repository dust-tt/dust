-- Migration created on Mar 25, 2025
ALTER TABLE "public"."content_fragments" ADD COLUMN "nodeType" VARCHAR(255);
UPDATE "public"."content_fragments"
SET "nodeType" = CASE
  WHEN "contentType" IN (
    'application/vnd.google-apps.spreadsheet',
    'text/csv',
    'application/vnd.dust.notion.database'
  ) THEN 'table'
  ELSE 'document'
END
WHERE "nodeId" IS NOT NULL;
