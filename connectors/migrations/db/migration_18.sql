ALTER TABLE "public"."remote_tables" ADD COLUMN "permission" VARCHAR(255) NOT NULL;
ALTER TABLE "public"."remote_tables" ADD COLUMN "lastUpsertedAt" TIMESTAMP WITH TIME ZONE;

