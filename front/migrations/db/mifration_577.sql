-- Migration created on Apr 13, 2026
-- Add index on metronomeCustomerId for workspaces table

CREATE INDEX CONCURRENTLY IF NOT EXISTS "workspaces_metronome_customer_id" ON "workspaces" ("metronomeCustomerId");