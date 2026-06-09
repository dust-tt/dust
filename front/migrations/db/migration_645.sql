-- Migration created on May 20, 2026
ALTER TABLE "public"."conversation_forks" ADD COLUMN "fileCopyStatus" VARCHAR(255) NOT NULL DEFAULT 'done';
