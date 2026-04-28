-- Migration created on Apr 28, 2026
ALTER TABLE agent_suggestions
  ALTER COLUMN source SET DEFAULT 'sidekick';
