-- Migration created on 2026-05-13
ALTER TABLE "public"."sandboxes" ADD COLUMN "baseImage" VARCHAR(255);
ALTER TABLE "public"."sandboxes" ADD COLUMN "version" VARCHAR(255);
ALTER TABLE "public"."sandboxes" ADD COLUMN "killRequestedAt" TIMESTAMP WITH TIME ZONE;
CREATE INDEX CONCURRENTLY "sandboxes_kill_requested_at_idx"
  ON "public"."sandboxes" ("killRequestedAt")
  WHERE "killRequestedAt" IS NOT NULL;
CREATE INDEX CONCURRENTLY "sandboxes_base_image_version_idx"
  ON "public"."sandboxes" ("baseImage", "version");
