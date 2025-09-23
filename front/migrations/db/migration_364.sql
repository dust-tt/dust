-- Migration created on Sep 23, 2025
ALTER TABLE "public"."conversation_participants" ADD COLUMN "favorite" BOOLEAN NOT NULL DEFAULT false;
