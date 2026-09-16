/*
Pre-deploy: add `agents."currentVersion"`, the `version` of the agent's current row in
`agent_configurations` (the highest one). Together with `agents.id` it resolves the current
configuration through the unique `(agentId, version)` index, without ordering the version history.

NOT NULL with default 0 from the start: every agent is created with its version 0 row, so new rows
are correct as inserted. Existing agents that have been upgraded are set to their highest version
by `migrations/20260915_backfill_agent_current_version.ts`; until then their pointer is stale and
readers keep resolving the current version as today.

No foreign key: `agent_configurations` already references `agents`, and a constraint in the other
direction would make the two tables reference each other. The invariant is held by
`AgentResource.setCurrentConfiguration` and `destroyAgentConfigurationRow`, and checked by the
backfill script. Adding a NOT NULL column with a constant default does not rewrite the table.
*/

/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."agents" ADD COLUMN "currentVersion" integer NOT NULL DEFAULT 0;
