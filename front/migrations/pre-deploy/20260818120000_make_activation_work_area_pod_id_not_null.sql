-- Work areas now always belong to a specific Learning Space: podId is non-nullable.
-- Drop any staging rows that still carry a null podId (pre-design-change data).
DELETE FROM "public"."activation_work_areas" WHERE "podId" IS NULL;

ALTER TABLE "public"."activation_work_areas"
  ALTER COLUMN "podId" SET NOT NULL;
