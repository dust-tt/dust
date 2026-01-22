-- Script to backfill lastReadAt for ConversationParticipant
-- Sets lastReadAt to current timestamp for participants with unread = false
-- Leaves lastReadAt as NULL for participants with unread = true

UPDATE "conversation_participants"
SET "lastReadAt" = NOW()
WHERE "unread" = false;

-- No action needed for unread = true (lastReadAt remains NULL)
