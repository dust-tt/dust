import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import { buildToolsetsContext } from "@app/lib/api/assistant/global_agents/configurations/dust/dust";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/global/registry";
import type { AgentLoopExecutionData } from "@app/types/assistant/agent_run";

export const discoverToolsSkill = {
  sId: "discover_tools",
  name: "Discover Tools",
  userFacingDescription:
    "Automatically discover and activate specialized tools as needed. Extend your agent's capabilities on-demand without manual configuration.",
  agentFacingDescription:
    "List available toolsets and enable them for the current conversation.",
  fetchInstructions: async (
    auth: Authenticator,
    { spaceIds }: { spaceIds: string[]; agentLoopData?: AgentLoopExecutionData }
  ) => {
    const allToolsets = await MCPServerViewResource.listBySpaceIds(
      auth,
      spaceIds,
      { includeGlobalSpace: true }
    );

    // When the official Notion MCP is present, hide the internal Notion server.
    const hasOfficialNotion = allToolsets.some(
      (t) => t.serverType === "remote" && t.toJSON().server.name === "Notion"
    );

    const availableToolsets = allToolsets.filter((toolset) => {
      const mcpServerView = toolset.toJSON();

      if (
        hasOfficialNotion &&
        mcpServerView.serverType === "internal" &&
        mcpServerView.server.name === "notion"
      ) {
        return false;
      }

      return (
        getMCPServerRequirements(mcpServerView).noRequirement &&
        mcpServerView.server.availability !== "auto_hidden_builder"
      );
    });

    return buildDiscoverToolsInstructions(availableToolsets);
  },
  mcpServers: [{ name: "toolsets" }],
  version: 1,
  icon: "ToolsIcon",
  isAutoEnabled: true,
} as const satisfies GlobalSkillDefinition;

export function buildDiscoverToolsInstructions(
  availableToolsets: MCPServerViewResource[]
): string {
  return buildToolsetsContext(availableToolsets);
}
