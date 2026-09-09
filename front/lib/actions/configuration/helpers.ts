import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { DataSourceConfiguration } from "@app/lib/api/assistant/configuration/types";
import type { AdditionalConfigurationType } from "@app/lib/models/agent/actions/mcp";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";

export function buildServerSideMCPServerConfiguration({
  mcpServerView,
  dataSources = null,
  serverNameOverride,
  childAgentId = null,
  additionalConfiguration = {},
}: {
  mcpServerView: MCPServerViewResource;
  dataSources?: DataSourceConfiguration[] | null;
  serverNameOverride?: string;
  childAgentId?: string | null;
  additionalConfiguration?: AdditionalConfigurationType;
}): ServerSideMCPServerConfigurationType {
  const { server } = mcpServerView.toJSON();

  return {
    id: -1,
    sId: `mcp_${server.sId}`,
    type: "mcp_server_configuration",
    name: serverNameOverride ?? mcpServerView.name ?? server.name,
    description: mcpServerView.description ?? server.description,
    icon: server.icon,
    mcpServerViewId: mcpServerView.sId,
    internalMCPServerId: mcpServerView.internalMCPServerId,
    dataSources,
    tables: null,
    childAgentId,
    additionalConfiguration,
    timeFrame: null,
    dustAppConfiguration: null,
    jsonSchema: null,
    secretName: null,
    dustProject: null,
  };
}
