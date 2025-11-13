import config from "@app/lib/api/config";
import { getDisplayNameForDataSource } from "@app/lib/data_sources";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
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
    name: getDisplayNameForDataSource(dataSource.toJSON()),
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
    name: getDisplayNameForDataSource(dataSourceView.dataSource.toJSON()),
    type: "Data Source View",
    space: spaceToPokeJSON(dataSourceView.space),
  };
}

export async function mcpServerViewToPokeJSON(
  mcpServerView: MCPServerViewResource
): Promise<PokeMCPServerViewType> {
  const workspace = await WorkspaceResource.fetchByModelId(
    mcpServerView.workspaceId
  );
  const json = mcpServerView.toJSON();

  return {
    ...json,
    link: workspace
      ? `${config.getClientFacingUrl()}/poke/${workspace.sId}/spaces/${mcpServerView.space.sId}/mcp_server_views/${mcpServerView.sId}`
      : null,
    name: json.server.name,
    type: "MCP Server View",
    space: spaceToPokeJSON(mcpServerView.space),
  };
}
