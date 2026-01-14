-- Migration created on Jan 14, 2026

-- Alter agentId column
ALTER TABLE user_tool_approvals
  ALTER COLUMN "agentId" SET DEFAULT '',
  ALTER COLUMN "agentId" SET NOT NULL;

-- Alter argsAndValuesMd5 column
ALTER TABLE user_tool_approvals
  ALTER COLUMN "argsAndValuesMd5" SET DEFAULT '',
  ALTER COLUMN "argsAndValuesMd5" SET NOT NULL;
