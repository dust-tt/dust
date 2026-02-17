import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import type {
  DataSourceConfiguration,
  DataSourceFilter,
  ProjectConfiguration,
  TableDataSourceConfiguration,
} from "@app/lib/api/assistant/configuration/types";
import type { Authenticator } from "@app/lib/auth";
import type { AgentDataSourceConfigurationModel } from "@app/lib/models/agent/actions/data_sources";
import type { AdditionalConfigurationType } from "@app/lib/models/agent/actions/mcp";
import type { AgentProjectConfigurationModel } from "@app/lib/models/agent/actions/projects";
import type { AgentTablesQueryConfigurationTableModel } from "@app/lib/models/agent/actions/tables_query";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { makeSId } from "@app/lib/resources/string_ids";

export type RetrievalTimeframe =
  | "auto"
  | "none"
  | {
      duration: number;
      unit: "hour" | "day" | "week" | "month" | "year";
    };

export function renderDataSourceConfiguration(
  auth: Authenticator,
  dataSourceConfig: AgentDataSourceConfigurationModel
): DataSourceConfiguration & { sId: string } {
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
      workspaceId: dataSourceConfig.workspaceId,
    }),
    workspaceId: auth.getNonNullableWorkspace().sId,
    dataSourceViewId: DataSourceViewResource.modelIdToSId({
      id: dataSourceConfig.dataSourceViewId,
      workspaceId: dataSourceConfig.workspaceId,
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

export function renderProjectConfiguration(
  project: AgentProjectConfigurationModel
): ProjectConfiguration {
  const { project: space } = project;

  return {
    workspaceId: project.workspace.sId,
    projectId: SpaceResource.modelIdToSId({
      id: space.id,
      workspaceId: space.workspaceId,
    }),
  };
}

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
