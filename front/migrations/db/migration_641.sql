-- Migration created on May 18, 2026
ALTER TABLE "public"."conversation_forks" ADD COLUMN "gcsMountStatus" VARCHAR(255) NOT NULL DEFAULT 'pending';
