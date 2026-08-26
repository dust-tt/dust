-- Work areas belong to a pod; userId is leftover denormalization. Make it
-- nullable so new code can stop writing it before the post-deploy drop.
ALTER TABLE "public"."activation_work_areas"
  ALTER COLUMN "userId" DROP NOT NULL;
