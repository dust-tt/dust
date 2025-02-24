-- Migration created on Feb 18, 2025
ALTER TABLE "public"."conversations" ADD COLUMN "currentThreadVersion" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "public"."messages" ADD COLUMN "nextVersionMessageId" BIGINT;
ALTER TABLE "public"."messages" ADD COLUMN "previousVersionMessageId" BIGINT;
ALTER TABLE "public"."messages" ADD COLUMN "threadVersions" INTEGER[] DEFAULT ARRAY[0]::INTEGER[];
