ALTER TABLE "public"."remote_schemas" ADD COLUMN "lastUpsertedAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE "public"."remote_databases" ADD COLUMN "lastUpsertedAt" TIMESTAMP WITH TIME ZONE;