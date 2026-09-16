import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { AutoInternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids_server";

/**
 * Get the building_agents_and_skills MCP server, which lets agents propose agent and skill
 * changes as reviewable suggestions. Only present when the view was prefetched, i.e. when the
 * workspace has the `conversational_building` feature flag.
 */
export function getBuildingAgentsAndSkillsServer(
  autoInternalViews: Map<AutoInternalMCPServerNameType, MCPServerViewResource>
): ServerSideMCPServerConfigurationType | null {
  const view = autoInternalViews.get("building_agents_and_skills") ?? null;
  if (!view) {
    return null;
  }

  return {
    id: -1,
    sId: generateRandomModelSId(),
    type: "mcp_server_configuration",
    name: view.name ?? "building_agents_and_skills",
    description:
      view.description ??
      "Propose agent and skill updates as suggestions their editors can review.",
    dataSources: null,
    tables: null,
    childAgentId: null,
    timeFrame: null,
    jsonSchema: null,
    secretName: null,
    dustProject: null,
    additionalConfiguration: {},
    mcpServerViewId: view.sId,
    dustAppConfiguration: null,
    internalMCPServerId: view.mcpServerId,
  };
}
