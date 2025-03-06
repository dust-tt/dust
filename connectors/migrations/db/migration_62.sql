ALTER TABLE "public"."gong_configurations" ADD COLUMN "retentionPeriodDays" INTEGER;
UPDATE "public"."gong_configurations" SET "retentionPeriodDays" = 180;
ALTER TABLE "public"."gong_configurations" ALTER COLUMN "retentionPeriodDays" SET NOT NULL;
ALTER TABLE "gong_configurations" ALTER COLUMN "lastSyncTimestamp" SET NOT NULL;
