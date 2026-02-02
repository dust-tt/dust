import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import type {
  MCPServerViewsForGlobalAgentsMap,
  PrefetchedDataSourcesType,
} from "@app/lib/api/assistant/global_agents/tools";
import {
  isIncludedInDefaultCompanyData,
  isRemoteDatabase,
} from "@app/lib/data_sources";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";

export function getCompanyDataAction(
  preFetchedDataSources: PrefetchedDataSourcesType | null,
  mcpServerViews: MCPServerViewsForGlobalAgentsMap
): MCPServerConfigurationType | null {
  const { data_sources_file_system: dataSourcesFileSystemMCPServerView } =
    mcpServerViews;

  if (!preFetchedDataSources || !dataSourcesFileSystemMCPServerView) {
    return null;
  }

  const dataSourceViews = preFetchedDataSources.dataSourceViews.filter(
    (dsView) =>
      dsView.isInGlobalSpace &&
      isIncludedInDefaultCompanyData(dsView.dataSource)
  );
  if (dataSourceViews.length === 0) {
    return null;
  }

  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.DEEP_DIVE + "-company-data-action",
    type: "mcp_server_configuration",
    name: "company_data",
    description: "The user's internal company data.",
    mcpServerViewId: dataSourcesFileSystemMCPServerView.sId,
    internalMCPServerId: dataSourcesFileSystemMCPServerView.internalMCPServerId,
    dataSources: dataSourceViews.map((dsView) => ({
      dataSourceViewId: dsView.sId,
      workspaceId: preFetchedDataSources.workspaceId,
      filter: {
        parents: {
          in: dsView.parentsIn ?? [],
          not: [],
        },
        tags: null,
      },
    })),
    tables: null,
    childAgentId: null,
    additionalConfiguration: {},
    timeFrame: null,
    dustAppConfiguration: null,
    jsonSchema: null,
    secretName: null,
    dustProject: null,
  };
}

export function getCompanyDataWarehousesAction(
  preFetchedDataSources: PrefetchedDataSourcesType | null,
  mcpServerViews: MCPServerViewsForGlobalAgentsMap
): MCPServerConfigurationType | null {
  const { data_warehouses: dataWarehousesMCPServerView } = mcpServerViews;

  if (!preFetchedDataSources || !dataWarehousesMCPServerView) {
    return null;
  }

  const globalWarehouses = preFetchedDataSources.dataSourceViews.filter(
    (dsView) => dsView.isInGlobalSpace && isRemoteDatabase(dsView.dataSource)
  );

  if (globalWarehouses.length === 0) {
    return null;
  }

  return {
    id: -1,
    sId: GLOBAL_AGENTS_SID.DEEP_DIVE + "-data-warehouses-action",
    type: "mcp_server_configuration",
    name: "data_warehouses",
    description: "The user's data warehouses.",
    mcpServerViewId: dataWarehousesMCPServerView.sId,
    internalMCPServerId: dataWarehousesMCPServerView.internalMCPServerId,
    dataSources: globalWarehouses.map((dsView) => ({
      dataSourceViewId: dsView.sId,
      workspaceId: preFetchedDataSources.workspaceId,
      filter: {
        parents: { in: dsView.parentsIn ?? [], not: [] },
        tags: null,
      },
    })),
    tables: null,
    childAgentId: null,
    additionalConfiguration: {},
    timeFrame: null,
    dustAppConfiguration: null,
    jsonSchema: null,
    secretName: null,
    dustProject: null,
  };
}
