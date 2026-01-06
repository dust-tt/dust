import * as fs from "fs";
import * as path from "path";

import { getInternalMCPServerNameFromSId } from "@app/lib/actions/mcp_internal_actions/constants";

interface AgentData {
  workspace_sid: string;
  agent_id: string;
  agent_name: string;
  instructions: string;
  tools: string; // JSON string array of tool sIds
  agents_using_it: string; // JSON string array
}

interface EnrichedAgentData extends Omit<AgentData, "tools"> {
  tools: Array<{
    sId: string;
    name: string;
  }>;
}

function resolveToolName(toolSId: string | null): string {
  // Handle null or empty values
  if (!toolSId) {
    return "unknown";
  }

  // Check if it's an internal MCP server (starts with "ims_")
  if (toolSId.startsWith("ims_")) {
    const name = getInternalMCPServerNameFromSId(toolSId);
    if (name) {
      return name;
    }
  }

  // For non-internal tools (custom names like "hubspot personal"), return as-is
  return toolSId;
}

async function main() {
  const inputPath = path.join(__dirname, "1_agents.json");
  const outputPath = path.join(__dirname, "2_agents_enriched.json");

  console.log(`Reading agents from ${inputPath}...`);

  const rawData = fs.readFileSync(inputPath, "utf-8");
  const agents: AgentData[] = JSON.parse(rawData);

  console.log(`Processing ${agents.length} agents...`);

  const enrichedAgents: EnrichedAgentData[] = agents.map((agent) => {
    // Parse the tools JSON string
    const toolSIds: string[] = JSON.parse(agent.tools);

    // Resolve each tool sId to its name
    const enrichedTools = toolSIds.map((sId) => ({
      sId,
      name: resolveToolName(sId),
    }));

    return {
      ...agent,
      tools: enrichedTools,
    };
  });

  // Write enriched data
  fs.writeFileSync(outputPath, JSON.stringify(enrichedAgents, null, 2));

  console.log(`Enriched data written to ${outputPath}`);

  // Print summary of tool name resolutions
  const toolStats = new Map<string, number>();
  for (const agent of enrichedAgents) {
    for (const tool of agent.tools) {
      const count = toolStats.get(tool.name) ?? 0;
      toolStats.set(tool.name, count + 1);
    }
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
