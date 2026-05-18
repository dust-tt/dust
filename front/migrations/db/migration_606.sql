-- Migration created on Apr 28, 2026
DELETE FROM agent_suggestions
WHERE
    source != 'sidekick';

ALTER TABLE agent_suggestions
DROP COLUMN IF EXISTS source;