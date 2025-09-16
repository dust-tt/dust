-- Add event type filtering support to webhook sources
ALTER TABLE "webhook_sources" ADD COLUMN "eventTypeHeader" varchar(255);
ALTER TABLE "webhook_sources" ADD COLUMN "allowedEventTypes" jsonb;