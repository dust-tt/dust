import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { getDisplayNameForDataSource } from "@app/lib/data_sources";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type {
  PokeDataSourceType,
  PokeDataSourceViewType,
  PokeMCPServerViewType,
  PokeSpaceType,
} from "@app/types";

export function spaceToPokeJSON(space: SpaceResource): PokeSpaceType {
  return {
    id: space.id,
    ...space.toJSON(),
    groups: space.groups.map((group) => group.toJSON()),
  };
}

export async function dataSourceToPokeJSON(
  dataSource: DataSourceResource
): Promise<PokeDataSourceType> {
  const workspace = await WorkspaceResource.fetchByModelId(
    dataSource.workspaceId
  );

  return {
    ...dataSource.toJSON(),
    link: workspace
      ? `${config.getClientFacingUrl()}/poke/${workspace.sId}/data_sources/${dataSource.sId}`
      : null,
    name:
      (workspace ? `${workspace.name}'s ` : "") +
      (dataSource.connectorProvider
        ? getDisplayNameForDataSource(dataSource.toJSON())
        : `folder (${dataSource.name})`),
    type: "Data Source",
    space: spaceToPokeJSON(dataSource.space),
  };
}

export async function dataSourceViewToPokeJSON(
  dataSourceView: DataSourceViewResource
): Promise<PokeDataSourceViewType> {
  const workspace = await WorkspaceResource.fetchByModelId(
    dataSourceView.workspaceId
  );

  return {
    ...dataSourceView.toJSON(),
    dataSource: await dataSourceToPokeJSON(dataSourceView.dataSource),
    link: workspace
      ? `${config.getClientFacingUrl()}/poke/${workspace.sId}/spaces/${dataSourceView.space.sId}/data_source_views/${dataSourceView.sId}`
      : null,
    name:
      (workspace ? `${workspace.name}'s ` : "") +
      (dataSourceView.dataSource.connectorProvider
        ? getDisplayNameForDataSource(dataSourceView.dataSource.toJSON())
        : `folder (${dataSourceView.dataSource.name})`),
    type: "Data Source View",
    space: spaceToPokeJSON(dataSourceView.space),
  };
}

export async function mcpServerViewToPokeJSON(
  mcpServerView: MCPServerViewResource,
  auth: Authenticator
): Promise<PokeMCPServerViewType> {
  const workspace = await WorkspaceResource.fetchByModelId(
    mcpServerView.workspaceId
  );
  const json = mcpServerView.toJSON();

  // Get all connection IDs (both workspace and personal) for this MCP server
  const mcpServerId = mcpServerView.mcpServerId;

  const allConnections = await MCPServerConnectionResource.listByMCPServer(
    auth,
    { mcpServerId }
  );

  if (allConnections.isErr()) {
    throw new Error("Failed to get MCP server connections");
  }

  const connections = allConnections.value.map((conn) => {
    const connJson = conn.toJSON();
    return {
      connectionType: conn.connectionType,
      userId: connJson.user.userId,
      userFullName: connJson.user.fullName,
      userEmail: connJson.user.email,
    };
  });

  delete json.server.developerSecretSelectionDescription;
  delete json.server.developerSecretSelection;

  return {
    ...json,
    link: workspace
      ? `${config.getClientFacingUrl()}/poke/${workspace.sId}/spaces/${mcpServerView.space.sId}/mcp_server_views/${mcpServerView.sId}`
      : null,
    name: json.server.name,
    type: "MCP Server View",
    space: spaceToPokeJSON(mcpServerView.space),
    connections: connections,
  };
}
