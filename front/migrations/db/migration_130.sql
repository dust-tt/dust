ALTER TABLE "public"."tracker_configurations" ADD COLUMN "lastNotifiedAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE "public"."tracker_generations" ADD COLUMN "consumedAt" TIMESTAMP WITH TIME ZONE;
