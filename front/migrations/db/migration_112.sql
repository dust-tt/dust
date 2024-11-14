-- Migration created on Nov 14, 2024
-- Backfill script that needs to be ran: 20241114_backfill_cf_sid.ts
ALTER TABLE
    "public"."content_fragments"
ALTER COLUMN
    "sId"
SET
    NOT NULL;

CREATE INDEX CONCURRENTLY "content_fragments_s_id" ON "content_fragments" ("sId");