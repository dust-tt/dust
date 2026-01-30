-- Rename "pending" mention status to "pending_conversation_access".
-- All existing "pending" are migrated to "pending_conversation_access" (the most common case)
-- rather than trying to determine project vs conversation context, which would be complex
-- and could show prompts to non-editors in project conversations.
UPDATE
    mentions
SET
    status = 'pending_conversation_access'
WHERE
    status = 'pending';
