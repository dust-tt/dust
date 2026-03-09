-- Backfill change source to 'sidekick' instead of copilot
UPDATE agent_suggestions SET source='sidekick' WHERE source='copilot';
