/*
Add shared frame tabs (path, title, icon) to project_metadata. Empty array default;
feature is gated by pod_frame_tabs so no backfill is required.

Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."project_metadata" ADD COLUMN "frameTabs" jsonb DEFAULT '[]'::jsonb NOT NULL;
