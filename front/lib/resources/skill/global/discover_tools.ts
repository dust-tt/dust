import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
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
  const toolsetsList = availableToolsets
    // Sort by display name, then by sId for deterministic ordering.
    // This ensures consistent prompt generation for LLM cache optimization,
    // especially when multiple toolsets share the same display name.
    .sort((a, b) => {
      const aView = a.toJSON();
      const bView = b.toJSON();
      const nameCompare = getMcpServerViewDisplayName(aView).localeCompare(
        getMcpServerViewDisplayName(bView)
      );
      if (nameCompare !== 0) {
        return nameCompare;
      }
      // Tie-breaker: sort by sId for stable ordering when names are equal.
      return aView.sId.localeCompare(bView.sId);
    })
    .map((toolset) => {
      const mcpServerView = toolset.toJSON();
      const sId = mcpServerView.sId;
      const displayName = getMcpServerViewDisplayName(mcpServerView);
      const description = getMcpServerViewDescription(mcpServerView);
      return `- **${displayName}** (toolsetId: \`${sId}\`): ${description}`;
    })
    .join("\n");

  return `The "toolsets" tools allow listing and enabling additional tools.

<available_toolsets>
${toolsetsList.length > 0 ? toolsetsList : "No additional toolsets are currently available."}
</available_toolsets>

When encountering any request that might benefit from specialized tools, review the available toolsets above.
Enable relevant toolsets using \`toolsets__enable\` with the toolsetId (shown in backticks) before attempting to fulfill the request.
Never assume or reply that you cannot do something before checking if there's a relevant toolset available.`;
}
