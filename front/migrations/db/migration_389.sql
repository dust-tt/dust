-- Migration created on Oct 22, 2025
-- Table conversations
DROP INDEX IF EXISTS "conversations_s_id";
DROP INDEX IF EXISTS "conversations_wId_idx";

-- Table conversation_participants
DROP INDEX IF EXISTS "conversation_participants_conversation_id";
DROP INDEX IF EXISTS "conversation_participants_user_id_action";
DROP INDEX IF EXISTS "conversation_participants_user_id_conversation_id";
DROP INDEX IF EXISTS "conversation_participants_user_id";
