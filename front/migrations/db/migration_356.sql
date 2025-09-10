-- Migration created on Sep 10, 2025
-- Add webhookSourceViewId column to triggers table for webhook trigger support

-- Add the webhookSourceViewId column
ALTER TABLE "triggers" 
ADD COLUMN "webhookSourceViewId" BIGINT DEFAULT NULL 
REFERENCES "webhook_sources_views" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Add constraint to ensure webhookSourceViewId is set for webhook triggers
ALTER TABLE "triggers" 
ADD CONSTRAINT "triggers_webhook_source_view_id_check" 
CHECK (
  (kind = 'webhook' AND "webhookSourceViewId" IS NOT NULL) OR 
  (kind != 'webhook' AND "webhookSourceViewId" IS NULL)
);
