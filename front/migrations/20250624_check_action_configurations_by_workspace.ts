import { QueryTypes } from "sequelize";

import { frontSequelize } from "@app/lib/resources/storage";
import logger from "@app/logger/logger";
import { makeScript } from "@app/scripts/helpers";

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

const actionTypes = [
  { type: "retrieval", table: "agent_retrieval_configurations" },
  { type: "websearch", table: "agent_websearch_configurations" },
  { type: "browse", table: "agent_browse_configurations" },
  { type: "mcp_server", table: "agent_mcp_server_configurations" },
  { type: "dust_app_run", table: "agent_dust_app_run_configurations" },
  { type: "tables_query", table: "agent_tables_query_configurations" },
  { type: "process", table: "agent_process_configurations" },
] as const;

makeScript({}, async () => {
  logger.info("Analyzing action configurations by type and workspace...");
  
  const activeAgents = await frontSequelize.query<AgentInfo>(`
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

  for (const actionType of actionTypes) {
    console.log(`\n${actionType.type.toUpperCase()} CONFIGURATIONS:`);
    console.log("=".repeat(50));
    
    const query = `
      SELECT 
        act."agentConfigurationId",
        act."workspaceId"
      FROM ${actionType.table} act
      WHERE act."agentConfigurationId" IN (
        SELECT id FROM agent_configurations WHERE status = 'active'
      )
    `;
    
    const actionConfigs = await frontSequelize.query<ActionConfig>(query, { 
      type: QueryTypes.SELECT 
    });

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
    
    const [result] = await frontSequelize.query<SummaryResult>(countQuery, { 
      type: QueryTypes.SELECT 
    });
    
    console.log(`${actionType.type}: ${result.workspace_count} workspaces, ${result.total_configs} configurations`);
  }
});