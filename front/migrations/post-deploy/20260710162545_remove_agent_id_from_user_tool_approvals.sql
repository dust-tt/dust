/*
Run migrations/20260710_downgrade_unscoped_medium_tool_metadata.ts and
migrations/20260710_deduplicate_user_tool_approvals.ts before applying this migration. Build the
replacement index before dropping agentId to minimize the period without uniqueness enforcement for
medium-stake approvals.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
CREATE UNIQUE INDEX CONCURRENTLY "user_tool_approvals_without_agent_id_unique_idx"
ON "user_tool_approvals" (
  "workspaceId",
  "userId",
  "mcpServerId",
  "toolName",
  "argsAndValuesMd5"
);

/*
Dropping agentId also drops the previous unique index that depends on it.
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "user_tool_approvals" DROP COLUMN "agentId";

SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER INDEX "user_tool_approvals_without_agent_id_unique_idx"
RENAME TO "user_tool_approvals_unique_idx";
