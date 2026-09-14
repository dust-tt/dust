import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { getDisplayNameForDataSource } from "@app/lib/data_sources";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { WorkspaceResource } from "@app/lib/resources/workspace_resource";
import type {
  PokeDataSourceType,
  PokeDataSourceViewType,
  PokeItemBase,
  PokeMCPServerViewType,
  PokeSpaceType,
} from "@app/types/poke";

export async function spaceToPokeJSON(
  auth: Authenticator,
  space: SpaceResource
): Promise<PokeSpaceType> {
  const groups = await space.fetchGroupResources(auth);
  const [enriched] = await SpaceResource.enrichSpacesWithAccess(auth, [space]);
  return {
    id: space.id,
    ...space.toJSON(),
    groups: groups.map((group) => group.toJSON()),
    isRestricted: enriched.isRestricted,
  };
}

export async function dataSourceToPokeItem(
  dataSource: DataSourceResource
): Promise<PokeItemBase> {
  const workspace = await WorkspaceResource.fetchByModelId(
    dataSource.workspaceId
  );

  return {
    id: dataSource.id,
    link: workspace
      ? `${config.getPokeAppUrl()}/${workspace.sId}/data_sources/${dataSource.sId}`
      : null,
    name:
      (workspace ? `${workspace.name}'s ` : "") +
      (dataSource.connectorProvider
        ? getDisplayNameForDataSource(dataSource.toJSON())
        : `folder (${dataSource.name})`),
    type: "Data Source",
  };
}

async function dataSourceToPokeJSON(
  auth: Authenticator,
  dataSource: DataSourceResource
): Promise<PokeDataSourceType> {
  return {
    ...dataSource.toJSON(),
    ...(await dataSourceToPokeItem(dataSource)),
    space: await spaceToPokeJSON(auth, dataSource.space),
  };
}

export async function dataSourceViewToPokeItem(
  dataSourceView: DataSourceViewResource
): Promise<PokeItemBase> {
  const workspace = await WorkspaceResource.fetchByModelId(
    dataSourceView.workspaceId
  );

  return {
    id: dataSourceView.id,
    link: workspace
      ? `${config.getPokeAppUrl()}/${workspace.sId}/spaces/${dataSourceView.space.sId}/data_source_views/${dataSourceView.sId}`
      : null,
    name:
      (workspace ? `${workspace.name}'s ` : "") +
      (dataSourceView.dataSource.connectorProvider
        ? getDisplayNameForDataSource(dataSourceView.dataSource.toJSON())
        : `folder (${dataSourceView.dataSource.name})`),
    type: "Data Source View",
  };
}

export async function dataSourceViewToPokeJSON(
  auth: Authenticator,
  dataSourceView: DataSourceViewResource
): Promise<PokeDataSourceViewType> {
  return {
    ...dataSourceView.toJSON(),
    dataSource: await dataSourceToPokeJSON(auth, dataSourceView.dataSource),
    ...(await dataSourceViewToPokeItem(dataSourceView)),
    space: await spaceToPokeJSON(auth, dataSourceView.space),
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

  return {
    ...json,
    server: {
      ...json.server,
      developerSecretSelectionDescription: null,
      developerSecretSelection: null,
    },
    link: workspace
      ? `${config.getPokeAppUrl()}/${workspace.sId}/spaces/${mcpServerView.space.sId}/mcp_server_views/${mcpServerView.sId}`
      : null,
    name: json.name ?? json.server.name,
    customName: json.name,
    type: "MCP Server View",
    space: await spaceToPokeJSON(auth, mcpServerView.space),
    connections: connections,
  };
}
