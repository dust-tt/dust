import type {
  DataSourceConfiguration,
  DataSourceFilter,
  TableDataSourceConfiguration,
} from "@app/lib/api/assistant/configuration/types";
import type { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import type { AgentTablesQueryConfigurationTable } from "@app/lib/models/assistant/actions/tables_query";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { makeSId } from "@app/lib/resources/string_ids";

export type RetrievalTimeframe =
  | "auto"
  | "none"
  | {
      duration: number;
      unit: "hour" | "day" | "week" | "month" | "year";
    };

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
        dataSourceConfig.parentsIn !== null ||
        dataSourceConfig.parentsNotIn !== null
          ? {
              in: dataSourceConfig.parentsIn,
              not: dataSourceConfig.parentsNotIn,
            }
          : null,
      tags,
    },
  };
}

export function renderTableConfiguration(
  table: AgentTablesQueryConfigurationTable
): TableDataSourceConfiguration & { sId: string } {
  const { dataSourceView } = table;

  return {
    sId: makeSId("table_configuration", {
      id: table.id,
      workspaceId: dataSourceView.workspaceId,
    }),
    dataSourceViewId: DataSourceViewResource.modelIdToSId({
      id: dataSourceView.id,
      workspaceId: dataSourceView.workspaceId,
    }),
    workspaceId: dataSourceView.workspace.sId,
    tableId: table.tableId,
  };
}
