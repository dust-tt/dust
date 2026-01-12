import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import type {
  DataSourceConfiguration,
  DataSourceFilter,
  TableDataSourceConfiguration,
} from "@app/lib/api/assistant/configuration/types";
import type { AgentDataSourceConfigurationModel } from "@app/lib/models/agent/actions/data_sources";
import type { AgentTablesQueryConfigurationTableModel } from "@app/lib/models/agent/actions/tables_query";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { makeSId } from "@app/lib/resources/string_ids";

export type RetrievalTimeframe =
  | "auto"
  | "none"
  | {
      duration: number;
      unit: "hour" | "day" | "week" | "month" | "year";
    };

export function renderDataSourceConfiguration(
  dataSourceConfig: AgentDataSourceConfigurationModel
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
  table: AgentTablesQueryConfigurationTableModel
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

export function buildServerSideMCPServerConfiguration({
  mcpServerView,
  dataSources = null,
  serverNameOverride,
}: {
  mcpServerView: MCPServerViewResource;
  dataSources?: DataSourceConfiguration[] | null;
  serverNameOverride?: string;
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
    childAgentId: null,
    additionalConfiguration: {},
    timeFrame: null,
    dustAppConfiguration: null,
    jsonSchema: null,
    secretName: null,
  };
}
