-- Migration created on janv. 22, 2026
ALTER TABLE "public"."conversation_participants" ADD COLUMN "lastReadAt" TIMESTAMP WITH TIME ZONE;
