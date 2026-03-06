import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

import {
  getInternalMCPServerNameAndWorkspaceId,
  INTERNAL_MCP_SERVERS,
} from "@app/lib/actions/mcp_internal_actions/constants";
import type { ArgumentSpecs } from "@app/scripts/helpers";
import { makeScript } from "@app/scripts/helpers";

type AgentTool = {
  tool_sid?: string;
  tool_name: string | null;
  tool_type: "internal" | "remote";
  tool_description: string | null;
  mcp_server_view_id: number | null;
  remote_mcp_server_id: string | null;
  internal_mcp_server_id: string | null;
  // For internal tools, add the information from the codebase
  internal_tool_name?: string;
  internal_tool_description?: string;
};

type Datasource = {
  tags_in: string[] | null;
  tags_mode: string | null;
  parents_in: string[] | null;
  tags_not_in: string[] | null;
  datasource_id: string;
  datasource_name: string;
  connector_provider: string;
  data_source_view_id: number;
  datasource_description: string;
};

type Agent = {
  agent_sid: string;
  agent_name: string;
  description: string;
  instructions: string;
  total_messages: number;
  first_usage: string;
  last_usage: string;
  tools: AgentTool[];
  datasources: Datasource[];
};

const argumentSpecs: ArgumentSpecs = {
  workspaceName: {
    type: "string",
    required: true,
    description: "The workspace name to process (e.g., 'dust', ...)",
  },
};

/**
 * Script to enrich agents.json with internal tool information.
 *
 * This script:
 * 1. Reads agents from front/scripts/suggested_skills/<workspaceName>/agents.json
 * 2. For each internal tool (those with tool_name starting with "ims_"),
 *    retrieves the actual tool name and description from the codebase
 * 3. Writes the enriched agents to agents_with_tools.json
 *
 * Usage:
 *   npx tsx scripts/suggested_skills/0_bis_get_internal_tools.ts --workspaceName=<workspaceName>
 */

makeScript(argumentSpecs, async (args, scriptLogger) => {
  const workspaceName = args.workspaceName;

  // Read the agents.json file from the specified workspace
  const inputFilePath = join(__dirname, `${workspaceName}/agents.json`);
  scriptLogger.info({ filePath: inputFilePath }, "Reading agents.json file");

  let inputAgents: Agent[];

  try {
    const inputData = readFileSync(inputFilePath, "utf-8");
    inputAgents = JSON.parse(inputData);
  } catch (error) {
    throw new Error(`Failed to read agents.json file: ${error}`);
  }

  scriptLogger.info(
    { agentCount: inputAgents.length },
    "Loaded agents from input file"
  );

  // Enrich agents with internal tool information
  const agents: Agent[] = [];

  for (const agent of inputAgents) {
    const tools: AgentTool[] = agent.tools || [];

    // Enrich internal tools with proper names and descriptions
    for (const tool of tools) {
      if (tool.tool_type === "internal" && tool.tool_name?.startsWith("ims_")) {
        // This is an internal MCP server ID, decode it
        const serverNameResult = getInternalMCPServerNameAndWorkspaceId(
          tool.tool_name
        );

        if (serverNameResult.isOk()) {
          const serverName = serverNameResult.value.name;
          const serverDef = INTERNAL_MCP_SERVERS[serverName];

          if (serverDef) {
            tool.internal_tool_name = serverDef.serverInfo.name;
            tool.internal_tool_description = serverDef.serverInfo.description;
            scriptLogger.info(
              {
                toolSid: tool.tool_sid,
                serverName,
                toolName: tool.internal_tool_name,
              },
              "Enriched internal tool"
            );
          } else {
            scriptLogger.warn(
              { serverName, toolSid: tool.tool_sid },
              "Server definition not found"
            );
          }
        } else {
          scriptLogger.warn(
            {
              toolName: tool.tool_name,
              toolSid: tool.tool_sid,
              error: serverNameResult.error.message,
            },
            "Failed to decode internal MCP server ID"
          );
        }
      }
    }

    agents.push({
      agent_sid: agent.agent_sid,
      agent_name: agent.agent_name,
      description: agent.description,
      instructions: agent.instructions,
      total_messages: agent.total_messages,
      first_usage: agent.first_usage,
      last_usage: agent.last_usage,
      tools,
      datasources: agent.datasources || [],
    });

    scriptLogger.info(
      {
        agentSid: agent.agent_sid,
        agentName: agent.agent_name,
        toolCount: tools.length,
        datasourceCount: agent.datasources?.length || 0,
      },
      "Processed agent"
    );
  }

  // Write enriched agents to file
  const outputFilePath = join(
    __dirname,
    `${workspaceName}/agents_with_tools.json`
  );
  writeFileSync(outputFilePath, JSON.stringify(agents, null, 2));

  scriptLogger.info(
    { agentCount: agents.length, filePath: outputFilePath },
    "Successfully wrote enriched agents to file"
  );
});
