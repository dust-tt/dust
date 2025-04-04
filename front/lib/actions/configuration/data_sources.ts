import type {
  DataSourceConfiguration,
  DataSourceFilter,
} from "@app/lib/actions/retrieval";
import type { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { makeSId } from "@app/lib/resources/string_ids";

export function renderDataSourceConfiguration(
  dataSourceConfig: AgentDataSourceConfiguration
): DataSourceConfiguration & { sId: string } {
  const { dataSourceView } = dataSourceConfig;

  let tags: DataSourceFilter["tags"] = null;

  if (dataSourceConfig.tagsMode) {
    tags = {
      in: dataSourceConfig.tagsIn ?? [],
      not: dataSourceConfig.tagsNotIn ?? [],
      mode: dataSourceConfig.tagsMode,
    };
  }

  return {
    sId: makeSId("data_source_configuration", {
      id: dataSourceConfig.id,
      workspaceId: dataSourceView.workspaceId,
    }),
    workspaceId: dataSourceView.workspace.sId,
    dataSourceViewId: DataSourceViewResource.modelIdToSId({
      id: dataSourceView.id,
      workspaceId: dataSourceView.workspaceId,
    }),
    filter: {
      parents:
        dataSourceConfig.parentsIn && dataSourceConfig.parentsNotIn
          ? {
              in: dataSourceConfig.parentsIn,
              not: dataSourceConfig.parentsNotIn,
            }
          : null,
      tags,
    },
  };
}
