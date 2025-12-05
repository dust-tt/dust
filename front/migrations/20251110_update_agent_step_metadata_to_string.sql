-- Update agent_step_contents table
-- Convert metadata from object to string for reasoning type entries created today
-- Date: 2025-11-10

SELECT COUNT(*) FROM agent_step_contents
WHERE type = 'reasoning'
  AND "agentMessageId" IN (SELECT id FROM agent_messages WHERE "createdAt" >= '2025-11-10')
 AND jsonb_typeof(value->'value'->'metadata') = 'object';

BEGIN;

-- Update metadata: convert object to JSON string
UPDATE agent_step_contents
SET value = jsonb_set(
  value,
  '{value,metadata}',
  to_jsonb((value->'value'->'metadata')::text)
)
WHERE type = 'reasoning'
  AND "agentMessageId" IN (SELECT id FROM agent_messages WHERE "createdAt" >= '2025-11-10')
  AND jsonb_typeof(value->'value'->'metadata') = 'object';

SELECT COUNT(*) FROM agent_step_contents
WHERE type = 'reasoning'
  AND "agentMessageId" IN (SELECT id FROM agent_messages WHERE "createdAt" >= '2025-11-10')
 AND jsonb_typeof(value->'value'->'metadata') = 'object';

COMMIT;