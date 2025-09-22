-- Migration created on Jan 09, 2025
-- Update file share scope from 'conversation_participants' to 'none'

-- Update shareScope to 'none' for all shareable files where shareScope is currently 'conversation_participants'
UPDATE "shareable_files"
SET "shareScope" = 'none'
WHERE "shareScope" = 'conversation_participants';