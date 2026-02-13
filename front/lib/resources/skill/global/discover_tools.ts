import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import { buildToolsetsContext } from "@app/lib/api/assistant/global_agents/configurations/dust/dust";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/global/registry";

export const discoverToolsSkill = {
  sId: "discover_tools",
  name: "Discover Tools",
  userFacingDescription:
    "Automatically discover and activate specialized tools as needed. Extend your agent's capabilities on-demand without manual configuration.",
  agentFacingDescription:
    "List available toolsets and enable them for the current conversation.",
  fetchInstructions: async (auth: Authenticator, spaceIds: string[]) => {
    const allToolsets = await MCPServerViewResource.listBySpaceIds(
      auth,
      spaceIds,
      { includeGlobalSpace: true }
    );

    const availableToolsets = allToolsets.filter((toolset) => {
      const mcpServerView = toolset.toJSON();
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
  const toolsetsContextSection = buildToolsetsContext(availableToolsets);

  return `The "toolsets" tools allow listing and enabling additional tools.

${toolsetsContextSection}

When encountering any request that might benefit from specialized tools, review the available toolsets above.
Enable relevant toolsets using \`toolsets__enable\` with the toolsetId (shown in backticks) before attempting to fulfill the request.
Never assume or reply that you cannot do something before checking if there's a relevant toolset available.`;
}
