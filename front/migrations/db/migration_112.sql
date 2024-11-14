-- Migration created on Nov 14, 2024
-- Backfill script that needs to be ran: 20241114_backfill_cf_sid.ts
ALTER TABLE
    "public"."content_fragments"
ALTER COLUMN
    "sId"
SET
    NOT NULL;