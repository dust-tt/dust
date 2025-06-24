#!/usr/bin/env -S npx tsx

import { QueryTypes, Sequelize } from "sequelize";

// Database connection
const FRONT_DATABASE_URI = process.env.FRONT_DATABASE_URI;
if (!FRONT_DATABASE_URI) {
  console.error("Error: FRONT_DATABASE_URI environment variable is not set");
  process.exit(1);
}

const sequelize = new Sequelize(FRONT_DATABASE_URI, {
  logging: false,
});

interface AgentInfo {
  agent_id: number;
  agent_sid: string;
  agent_name: string;
  workspaceId: number;
  workspace_sid: string;
  workspace_name: string;
}

interface ActionConfig {
  agentConfigurationId: number;
  workspaceId: number;
}

interface SummaryResult {
  workspace_count: number;
  total_configs: number;
}

// Action configuration types
const actionTypes = [
  { type: "retrieval", table: "agent_retrieval_configurations" },
  { type: "websearch", table: "agent_websearch_configurations" },
  { type: "browse", table: "agent_browse_configurations" },
  { type: "mcp_server", table: "agent_mcp_server_configurations" },
  { type: "dust_app_run", table: "agent_dust_app_run_configurations" },
  { type: "tables_query", table: "agent_tables_query_configurations" },
  { type: "process", table: "agent_process_configurations" },
  { type: "visualization", table: "agent_visualization_configurations" },
] as const;

async function getActionConfigurationsByType(): Promise<void> {
  try {
    console.log("Analyzing action configurations by type and workspace...\n");
    
    // Get all active agent configurations with their workspaces
    const activeAgents = await sequelize.query<AgentInfo>(`
      SELECT 
        ac.id as agent_id,
        ac."sId" as agent_sid,
        ac.name as agent_name,
        ac."workspaceId",
        w."sId" as workspace_sid,
        w.name as workspace_name
      FROM agent_configurations ac
      JOIN workspaces w ON ac."workspaceId" = w.id
      WHERE ac.status = 'active'
    `, { type: QueryTypes.SELECT });

    const agentMap: Record<number, AgentInfo> = {};
    activeAgents.forEach(agent => {
      agentMap[agent.agent_id] = agent;
    });

    // For each action type, find which workspaces have agents using it
    for (const actionType of actionTypes) {
      console.log(`\n${actionType.type.toUpperCase()} CONFIGURATIONS:`);
      console.log("=".repeat(50));
      
      // Get all action configurations of this type
      const query = `
        SELECT 
          act."agentConfigurationId",
          act."workspaceId"
        FROM ${actionType.table} act
        WHERE act."agentConfigurationId" IN (
          SELECT id FROM agent_configurations WHERE status = 'active'
        )
      `;
      
      const actionConfigs = await sequelize.query<ActionConfig>(query, { 
        type: QueryTypes.SELECT 
      });

      // Group by workspace
      const workspaceAgents: Record<string, Set<string>> = {};
      actionConfigs.forEach(config => {
        const agent = agentMap[config.agentConfigurationId];
        if (agent) {
          const wsKey = `${agent.workspace_sid} (${agent.workspace_name})`;
          if (!workspaceAgents[wsKey]) {
            workspaceAgents[wsKey] = new Set();
          }
          workspaceAgents[wsKey].add(`${agent.agent_sid} (${agent.agent_name})`);
        }
      });

      // Display results
      const workspaceCount = Object.keys(workspaceAgents).length;
      if (workspaceCount === 0) {
        console.log("  No active agent configurations found for this type.");
      } else {
        console.log(`  Found in ${workspaceCount} workspace(s):\n`);
        
        Object.entries(workspaceAgents)
          .sort(([a], [b]) => a.localeCompare(b))
          .forEach(([workspace, agents]) => {
            console.log(`  Workspace: ${workspace}`);
            console.log(`    Agents (${agents.size}):`);
            Array.from(agents).sort().forEach(agent => {
              console.log(`      - ${agent}`);
            });
            console.log();
          });
      }
    }

    // Summary statistics
    console.log("\nSUMMARY:");
    console.log("=".repeat(50));
    
    for (const actionType of actionTypes) {
      const countQuery = `
        SELECT COUNT(DISTINCT act."workspaceId") as workspace_count,
               COUNT(*) as total_configs
        FROM ${actionType.table} act
        WHERE act."agentConfigurationId" IN (
          SELECT id FROM agent_configurations WHERE status = 'active'
        )
      `;
      
      const [result] = await sequelize.query<SummaryResult>(countQuery, { 
        type: QueryTypes.SELECT 
      });
      
      console.log(`${actionType.type}: ${result.workspace_count} workspaces, ${result.total_configs} configurations`);
    }

  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

// Run the script
void getActionConfigurationsByType();