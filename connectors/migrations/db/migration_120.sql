-- Migration created on Apr 11, 2026
-- Tracks how many data-source documents a synced conversation uses (1 = monolithic id, N>1 = base-part-1..N) for efficient delete.
ALTER TABLE "public"."dust_project_conversations"
ADD COLUMN "documentPartCount" INTEGER;
