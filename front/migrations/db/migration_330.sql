-- Migration created on Aug 06, 2025
ALTER TABLE "public"."conversation_participants" ADD COLUMN "unread" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "public"."conversation_participants" ADD COLUMN "actionRequired" BOOLEAN NOT NULL DEFAULT FALSE; 
