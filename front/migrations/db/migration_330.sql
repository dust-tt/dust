-- Migration created on Aug 06, 2025
ALTER TABLE "public"."conversation_participants" ADD COLUMN "state" VARCHAR(255) NOT NULL DEFAULT 'read';
