-- Idempotent migration to copy slack connections for Slack Tools MCP to the new slack_tools provider.
-- This migration copies connections with use_case 'personal_actions' from the 'slack' provider to
-- 'slack_tools'. These are the personal connections used by the Slack Tools MCP (as opposed to the
-- Slack Bot MCP which uses 'bot' use_case, or data source connections which use 'connection'
-- use_case).
--
-- This migration is idempotent - it will skip any rows that have already been migrated.

-- Migration for personal_actions connections (these should always have user tokens)
UPDATE connections
SET provider = 'slack_tools'
WHERE provider = 'slack'
  AND metadata->>'use_case' = 'personal_actions';
