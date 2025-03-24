import config from "@app/lib/api/config";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { SpaceResource } from "@app/lib/resources/space_resource";
import { getWorkspaceByModelId } from "@app/lib/workspace";
import type {
  PokeDataSourceType,
  PokeDataSourceViewType,
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
  const workspace = await getWorkspaceByModelId(dataSource.workspaceId);

  return {
    ...dataSource.toJSON(),
    link: workspace
      ? `${config.getClientFacingUrl()}/poke/${workspace.sId}/data_sources/${dataSource.sId}`
      : null,
    name: `Data Source (${dataSource.name})`,
    space: spaceToPokeJSON(dataSource.space),
  };
}

export async function dataSourceViewToPokeJSON(
  dataSourceView: DataSourceViewResource
): Promise<PokeDataSourceViewType> {
  const workspace = await getWorkspaceByModelId(dataSourceView.workspaceId);

  return {
    ...dataSourceView.toJSON(),
    dataSource: await dataSourceToPokeJSON(dataSourceView.dataSource),
    link: workspace
      ? `${config.getClientFacingUrl()}/poke/${workspace.sId}/spaces/${dataSourceView.space.sId}/data_source_views/${dataSourceView.sId}`
      : null,
    name: `Data Source View (${dataSourceView.dataSource.name})`,
    space: spaceToPokeJSON(dataSourceView.space),
  };
}
