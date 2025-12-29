import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import type { Authenticator } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { GlobalSkillDefinition } from "@app/lib/resources/skill/global/registry";

export function buildDiscoverToolsInstructions(
  availableToolsets: MCPServerViewResource[]
): string {
  const toolsetsList = availableToolsets
    // Sort by display name to ensure consistent order for LLM cache optimization.
    .sort((a, b) => {
      const aView = a.toJSON();
      const bView = b.toJSON();
      return getMcpServerViewDisplayName(aView).localeCompare(
        getMcpServerViewDisplayName(bView)
      );
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

export const discoverToolsSkill = {
  sId: "discover_tools",
  name: "Discover Tools",
  userFacingDescription:
    "Discover and enable additional tools for specialized tasks.",
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
  internalMCPServerNames: ["toolsets"],
  version: 1,
  icon: "ToolsIcon",
  isAutoEnabled: true,
} as const satisfies GlobalSkillDefinition;
