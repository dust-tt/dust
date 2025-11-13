import { Pool } from "pg";

import logger from "@app/logger/logger";

async function run(sql: string) {
  const client = new Pool({ connectionString: process.env.FRONT_DATABASE_URI });
  const conn = await client.connect();
  try {
    await conn.query("BEGIN");
    await conn.query(sql);
    await conn.query("COMMIT");
  } catch (e) {
    await conn.query("ROLLBACK");
    logger.error({ err: e }, "Migration 20251113_fix_mcp_fk_delete_behavior failed");
    throw e;
  } finally {
    conn.release();
    await client.end();
  }
}

/*
  This migration ensures we do NOT cascade-deletes from MCP server configurations
  or agent configurations. We enforce ON DELETE RESTRICT consistently so that
  application code deletes dependent rows in the correct order.

  Affected foreign keys (drop if present, then recreate with RESTRICT):
  - agent_mcp_server_configurations.agentConfigurationId -> agent_configurations(id)
  - agent_data_source_configurations.mcpServerConfigurationId -> agent_mcp_server_configurations(id)
  - agent_tables_query_configuration_tables.mcpServerConfigurationId -> agent_mcp_server_configurations(id)
  - agent_reasoning_configurations.mcpServerConfigurationId -> agent_mcp_server_configurations(id)
  - agent_child_agent_configurations.mcpServerConfigurationId -> agent_mcp_server_configurations(id)
*/

const UP_SQL = `
  -- Agent MCP server config -> Agent configuration
  ALTER TABLE "agent_mcp_server_configurations"
    DROP CONSTRAINT IF EXISTS "agent_mcp_server_configurations_agentConfigurationId_fkey";
  ALTER TABLE "agent_mcp_server_configurations"
    ADD CONSTRAINT "agent_mcp_server_configurations_agentConfigurationId_fkey"
      FOREIGN KEY ("agentConfigurationId")
      REFERENCES "agent_configurations"("id")
      ON DELETE RESTRICT;

  -- Data source configurations -> MCP server config
  ALTER TABLE "agent_data_source_configurations"
    DROP CONSTRAINT IF EXISTS "agent_data_source_configurations_mcpServerConfigurationId_fkey";
  ALTER TABLE "agent_data_source_configurations"
    ADD CONSTRAINT "agent_data_source_configurations_mcpServerConfigurationId_fkey"
      FOREIGN KEY ("mcpServerConfigurationId")
      REFERENCES "agent_mcp_server_configurations"("id")
      ON DELETE RESTRICT;

  -- Tables query configuration table -> MCP server config
  ALTER TABLE "agent_tables_query_configuration_tables"
    DROP CONSTRAINT IF EXISTS "agent_tables_query_configuration_tables_mcpServerConfigurationId_fkey";
  ALTER TABLE "agent_tables_query_configuration_tables"
    ADD CONSTRAINT "agent_tables_query_configuration_tables_mcpServerConfigurationId_fkey"
      FOREIGN KEY ("mcpServerConfigurationId")
      REFERENCES "agent_mcp_server_configurations"("id")
      ON DELETE RESTRICT;

  -- Reasoning configuration -> MCP server config
  ALTER TABLE "agent_reasoning_configurations"
    DROP CONSTRAINT IF EXISTS "agent_reasoning_configurations_mcpServerConfigurationId_fkey";
  ALTER TABLE "agent_reasoning_configurations"
    ADD CONSTRAINT "agent_reasoning_configurations_mcpServerConfigurationId_fkey"
      FOREIGN KEY ("mcpServerConfigurationId")
      REFERENCES "agent_mcp_server_configurations"("id")
      ON DELETE RESTRICT;

  -- Child agent configuration -> MCP server config
  ALTER TABLE "agent_child_agent_configurations"
    DROP CONSTRAINT IF EXISTS "agent_child_agent_configurations_mcpServerConfigurationId_fkey";
  ALTER TABLE "agent_child_agent_configurations"
    ADD CONSTRAINT "agent_child_agent_configurations_mcpServerConfigurationId_fkey"
      FOREIGN KEY ("mcpServerConfigurationId")
      REFERENCES "agent_mcp_server_configurations"("id")
      ON DELETE RESTRICT;
`;

const DOWN_SQL = `
  -- Revert to CASCADE to restore previous behavior if needed.
  ALTER TABLE "agent_mcp_server_configurations"
    DROP CONSTRAINT IF EXISTS "agent_mcp_server_configurations_agentConfigurationId_fkey";
  ALTER TABLE "agent_mcp_server_configurations"
    ADD CONSTRAINT "agent_mcp_server_configurations_agentConfigurationId_fkey"
      FOREIGN KEY ("agentConfigurationId")
      REFERENCES "agent_configurations"("id")
      ON DELETE CASCADE;

  ALTER TABLE "agent_data_source_configurations"
    DROP CONSTRAINT IF EXISTS "agent_data_source_configurations_mcpServerConfigurationId_fkey";
  ALTER TABLE "agent_data_source_configurations"
    ADD CONSTRAINT "agent_data_source_configurations_mcpServerConfigurationId_fkey"
      FOREIGN KEY ("mcpServerConfigurationId")
      REFERENCES "agent_mcp_server_configurations"("id")
      ON DELETE CASCADE;

  ALTER TABLE "agent_tables_query_configuration_tables"
    DROP CONSTRAINT IF EXISTS "agent_tables_query_configuration_tables_mcpServerConfigurationId_fkey";
  ALTER TABLE "agent_tables_query_configuration_tables"
    ADD CONSTRAINT "agent_tables_query_configuration_tables_mcpServerConfigurationId_fkey"
      FOREIGN KEY ("mcpServerConfigurationId")
      REFERENCES "agent_mcp_server_configurations"("id")
      ON DELETE CASCADE;

  ALTER TABLE "agent_reasoning_configurations"
    DROP CONSTRAINT IF EXISTS "agent_reasoning_configurations_mcpServerConfigurationId_fkey";
  ALTER TABLE "agent_reasoning_configurations"
    ADD CONSTRAINT "agent_reasoning_configurations_mcpServerConfigurationId_fkey"
      FOREIGN KEY ("mcpServerConfigurationId")
      REFERENCES "agent_mcp_server_configurations"("id")
      ON DELETE CASCADE;

  ALTER TABLE "agent_child_agent_configurations"
    DROP CONSTRAINT IF EXISTS "agent_child_agent_configurations_mcpServerConfigurationId_fkey";
  ALTER TABLE "agent_child_agent_configurations"
    ADD CONSTRAINT "agent_child_agent_configurations_mcpServerConfigurationId_fkey"
      FOREIGN KEY ("mcpServerConfigurationId")
      REFERENCES "agent_mcp_server_configurations"("id")
      ON DELETE CASCADE;
`;

async function main() {
  const direction = process.argv[2];
  if (direction !== "up" && direction !== "down") {
    // eslint-disable-next-line no-console
    console.error("Usage: ts-node <script> [up|down]");
    process.exit(1);
  }
  await run(direction === "up" ? UP_SQL : DOWN_SQL);
  // eslint-disable-next-line no-console
  console.log(
    `Migration 20251113_fix_mcp_fk_delete_behavior ${direction} executed successfully.`
  );
}

// Run only when invoked directly (not when imported).
if (require.main === module) {
  main().catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  });
}

export {};

