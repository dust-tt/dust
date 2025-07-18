import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import type { AgentConfigurationType } from "@app/types";

/**
 * Get internal MCP servers that should be automatically added based on agent configuration.
 * These servers are added when certain agent features are enabled.
 */
export async function getInternalServers(
  auth: Authenticator,
  {
    agentConfiguration,
  }: {
    agentConfiguration: AgentConfigurationType;
  }
): Promise<MCPServerConfigurationType[]> {
  const internalServers: MCPServerConfigurationType[] = [];

  // Add file_manager server if visualization is enabled and feature flag is set.
  if (agentConfiguration.visualizationEnabled) {
    const featureFlags = await getFeatureFlags(auth.getNonNullableWorkspace());

    if (featureFlags.includes("file_manager_server")) {
      const fileManagerServerView =
        await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
          auth,
          "file_manager"
        );

      if (fileManagerServerView) {
        const serverConfig: MCPServerConfigurationType = {
          id: -1, // Temporary ID for internal servers
          additionalConfiguration: {},
          childAgentId: null,
          dataSources: null,
          description: "Create and update executable files for visualizations",
          dustAppConfiguration: null,
          internalMCPServerId: fileManagerServerView.mcpServerId,
          jsonSchema: null,
          mcpServerViewId: fileManagerServerView.sId,
          name: "file_manager",
          reasoningModel: null,
          sId: generateRandomModelSId(),
          tables: null,
          timeFrame: null,
          type: "mcp_server_configuration",
        };

        internalServers.push(serverConfig);
      }
    }
  }

  return internalServers;
}
