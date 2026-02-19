-- Migrate "pending" mention status to "pending_conversation_access".
-- The code handles both "pending" and "pending_conversation_access" identically,
-- so this migration can run before or after deploy without breaking anything.
-- All existing "pending" are migrated to "pending_conversation_access" (the most common case)
-- rather than trying to determine project vs conversation context, which would be complex
-- and could show prompts to non-editors in project conversations.
-- A follow-up PR will remove "pending" from the codebase once all data is migrated.
UPDATE
    mentions
SET
    status = 'pending_conversation_access'
WHERE
    status = 'pending';
