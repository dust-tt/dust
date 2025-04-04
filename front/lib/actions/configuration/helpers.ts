import type {
  DataSourceConfiguration,
  DataSourceFilter,
  RetrievalTimeframe,
} from "@app/lib/actions/retrieval";
import type { TableDataSourceConfiguration } from "@app/lib/actions/tables_query";
import type { AgentDataSourceConfiguration } from "@app/lib/models/assistant/actions/data_sources";
import type { AgentProcessConfiguration } from "@app/lib/models/assistant/actions/process";
import type { AgentRetrievalConfiguration } from "@app/lib/models/assistant/actions/retrieval";
import type { AgentTablesQueryConfigurationTable } from "@app/lib/models/assistant/actions/tables_query";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { makeSId } from "@app/lib/resources/string_ids";

export function renderRetrievalTimeframeType(
  action: AgentRetrievalConfiguration | AgentProcessConfiguration
): RetrievalTimeframe {
  let timeframe: RetrievalTimeframe = "auto";
  if (
    action.relativeTimeFrame === "custom" &&
    action.relativeTimeFrameDuration &&
    action.relativeTimeFrameUnit
  ) {
    timeframe = {
      duration: action.relativeTimeFrameDuration,
      unit: action.relativeTimeFrameUnit,
    };
  } else if (action.relativeTimeFrame === "none") {
    timeframe = "none";
  }
  return timeframe;
}

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

export function renderTableConfiguration(
  table: AgentTablesQueryConfigurationTable
): TableDataSourceConfiguration {
  const { dataSourceView } = table;

  return {
    dataSourceViewId: DataSourceViewResource.modelIdToSId({
      id: dataSourceView.id,
      workspaceId: dataSourceView.workspaceId,
    }),
    workspaceId: dataSourceView.workspace.sId,
    tableId: table.tableId,
  };
}
