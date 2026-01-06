import * as fs from "fs";
import * as path from "path";

import { getInternalMCPServerNameFromSId } from "@app/lib/actions/mcp_internal_actions/constants";

interface ToolData {
  sId: string;
  name: string;
  mcpServerViewId: number | null;
  isInternal: boolean;
  remoteMcpServerId: string | null;
}

interface AgentData {
  workspace_sid: string;
  agent_id: string;
  agent_name: string;
  instructions: string;
  tools: string; // JSON string array of tool objects
}

interface EnrichedToolData {
  sId: string;
  name: string;
  mcpServerViewId: number | null;
  isInternal: boolean;
  remoteMcpServerId: string | null;
}

interface EnrichedAgentData extends Omit<AgentData, "tools"> {
  tools: EnrichedToolData[];
}

function resolveToolName(toolSId: string | null): string {
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

  // For non-internal tools (custom names), return as-is
  return toolSId;
}

function parseArgs(): { workspace: string; keyword: string } {
  const args = process.argv.slice(2);

  const workspaceIndex = args.indexOf("--workspace");
  const keywordIndex = args.indexOf("--keyword");

  if (workspaceIndex === -1 || !args[workspaceIndex + 1]) {
    console.error("Error: --workspace argument is required");
    process.exit(1);
  }

  if (keywordIndex === -1 || !args[keywordIndex + 1]) {
    console.error("Error: --keyword argument is required");
    process.exit(1);
  }

  return {
    workspace: args[workspaceIndex + 1],
    keyword: args[keywordIndex + 1],
  };
}

async function main() {
  const { workspace, keyword } = parseArgs();

  const workspaceDir = path.join(__dirname, "runs", workspace);
  const keywordDir = path.join(workspaceDir, keyword);
  const inputPath = path.join(workspaceDir, "1_agents.json");
  const outputPath = path.join(keywordDir, "2_filtered_agents.json");

  // Check input file exists
  if (!fs.existsSync(inputPath)) {
    console.error(`Error: Input file not found: ${inputPath}`);
    console.error(
      `Please export agents from Metabase to: runs/${workspace}/1_agents.json`
    );
    process.exit(1);
  }

  // Create keyword directory if it doesn't exist
  if (!fs.existsSync(keywordDir)) {
    fs.mkdirSync(keywordDir, { recursive: true });
  }

  console.log(`Reading agents from ${inputPath}...`);
  const rawData = fs.readFileSync(inputPath, "utf-8");
  const agents: AgentData[] = JSON.parse(rawData);

  console.log(`Total agents: ${agents.length}`);
  console.log(`Filtering by keyword: "${keyword}" (case-insensitive)`);

  const keywordLower = keyword.toLowerCase();

  // Filter agents by keyword in instructions and enrich tool names
  const filteredAgents: EnrichedAgentData[] = agents
    .filter((agent) => {
      if (!agent.instructions) {
        return false;
      }
      return agent.instructions.toLowerCase().includes(keywordLower);
    })
    .map((agent) => {
      // Parse the tools JSON string (array of tool objects)
      const parsedTools: ToolData[] = JSON.parse(agent.tools);

      // Resolve internal MCP server names (ims_xxx -> human-readable name)
      const enrichedTools: EnrichedToolData[] = parsedTools.map((tool) => ({
        sId: tool.sId,
        name: resolveToolName(tool.sId),
        mcpServerViewId: tool.mcpServerViewId,
        isInternal: tool.isInternal,
        remoteMcpServerId: tool.remoteMcpServerId,
      }));

      return {
        ...agent,
        tools: enrichedTools,
      };
    });

  console.log(`Filtered agents: ${filteredAgents.length}`);

  if (filteredAgents.length === 0) {
    console.warn(
      `Warning: No agents found containing keyword "${keyword}" in their instructions`
    );
  }

  // Write filtered data
  fs.writeFileSync(outputPath, JSON.stringify(filteredAgents, null, 2));
  console.log(`Filtered agents written to ${outputPath}`);

}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
