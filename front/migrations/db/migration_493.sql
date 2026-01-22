-- Migration created on janv. 22, 2026
ALTER TABLE "public"."conversation_participants" ADD COLUMN "lastReadAt" TIMESTAMP WITH TIME ZONE;

-- Backfill lastReadAt for ConversationParticipant
-- Sets lastReadAt to current timestamp for participants with unread = false
-- Leaves lastReadAt as NULL for participants with unread = true
UPDATE "conversation_participants"
SET "lastReadAt" = NOW()
WHERE "unread" = false;

-- No action needed for unread = true (lastReadAt remains NULL)