import {
  isMCPConfigurationWithDataSource,
  isServerSideMCPServerConfiguration,
} from "@app/lib/actions/types/guards";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type {
  DataSourceConfiguration,
  TableDataSourceConfiguration,
} from "@app/lib/api/assistant/configuration/types";
import {
  getDataSourceFileSystemAction,
  getDataWarehousesAction,
} from "@app/lib/api/assistant/global_agents/configurations/dust/dust-deep";
import type { Authenticator } from "@app/lib/auth";
import { isRemoteDatabase } from "@app/lib/data_sources";
import { Message } from "@app/lib/models/assistant/conversation";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type {
  AgentMessageType,
  DataSourceViewType,
  Result,
  UserMessageType,
} from "@app/types";
import { Err, Ok } from "@app/types";
import { removeNulls } from "@app/types";
import type { AgentConfigurationType } from "@app/types/assistant/agent";

async function fetchDataSourceViews(
  auth: Authenticator,
  dataSourceViewIds: string[]
): Promise<DataSourceViewResource[]> {
  return DataSourceViewResource.fetchByIds(auth, dataSourceViewIds);
}

function createDataSourceViewsForFileSystem(
  allDataSourceConfigurations: DataSourceConfiguration[],
  allDataSourceViews: DataSourceViewResource[]
): Set<DataSourceViewType> {
  return new Set(
    removeNulls(
      allDataSourceConfigurations.map((dataSourceConfiguration) => {
        const dataSourceView = allDataSourceViews.find(
          (dsView) => dsView.sId === dataSourceConfiguration.dataSourceViewId
        );
        if (dataSourceView) {
          return dataSourceView.toJSON();
        }
      })
    )
  );
}

function createDataSourceViewsForTables(
  allTablesDataSourceConfigurations: TableDataSourceConfiguration[],
  allDataSourceViews: DataSourceViewResource[]
): Set<DataSourceViewType> {
  return new Set(
    removeNulls(
      allTablesDataSourceConfigurations.map((table) => {
        const dataSourceView = allDataSourceViews.find(
          (dsView) => dsView.sId === table.dataSourceViewId
        );
        if (dataSourceView && isRemoteDatabase(dataSourceView.dataSource)) {
          return dataSourceView.toJSON();
        }
      })
    )
  );
}

async function mergeDataSourceFileSystemAction(
  auth: Authenticator,
  agentConfiguration: AgentConfigurationType,
  allDataSourceConfigurations: DataSourceConfiguration[],
  dataSourceViewsForFileSystem: Set<DataSourceViewType>
): Promise<void> {
  const dataSourceFileSystemAction = agentConfiguration.actions.find(
    (action) => action.sId === "dust-deep-data-source-file-system-action"
  );

  if (
    dataSourceFileSystemAction &&
    isMCPConfigurationWithDataSource(dataSourceFileSystemAction)
  ) {
    dataSourceFileSystemAction.dataSources?.push(
      ...allDataSourceConfigurations
    );
  } else {
    const dataSourceFileSystemMCPServerView =
      await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
        auth,
        "data_sources_file_system"
      );

    const newDataSourceFileSystemAction = getDataSourceFileSystemAction(
      Array.from(dataSourceViewsForFileSystem),
      auth.getNonNullableWorkspace().sId,
      dataSourceFileSystemMCPServerView
    );

    if (newDataSourceFileSystemAction) {
      agentConfiguration.actions.push(newDataSourceFileSystemAction);
    }
  }
}

async function mergeDataWarehousesAction(
  auth: Authenticator,
  agentConfiguration: AgentConfigurationType,
  dataSourceViewsForTables: Set<DataSourceViewType>
): Promise<void> {
  const dataWarehousesAction = agentConfiguration.actions.find(
    (action) => action.sId === "dust-deep-data-warehouses-action"
  );

  if (
    dataWarehousesAction &&
    isMCPConfigurationWithDataSource(dataWarehousesAction)
  ) {
    dataWarehousesAction.dataSources?.push(
      ...Array.from(dataSourceViewsForTables).map((dsView) => ({
        dataSourceViewId: dsView.sId,
        workspaceId: auth.getNonNullableWorkspace().sId,
        filter: { parents: null },
      }))
    );
  } else {
    const dataWarehousesMCPServerView =
      await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
        auth,
        "data_warehouses"
      );

    const newDataWarehousesAction = getDataWarehousesAction(
      Array.from(dataSourceViewsForTables),
      auth.getNonNullableWorkspace().sId,
      dataWarehousesMCPServerView
    );

    if (newDataWarehousesAction) {
      agentConfiguration.actions.push(newDataWarehousesAction);
    }
  }
}

export async function augmentDustDeep(
  auth: Authenticator,
  agentConfiguration: AgentConfigurationType,
  agentMessage: AgentMessageType,
  userMessage: UserMessageType
): Promise<Result<AgentConfigurationType, Error>> {
  try {
    const agentMessageId = userMessage.context.userContextOriginMessageId;

    const agentMessage = await Message.findOne({
      where: {
        sId: agentMessageId,
        workspaceId: auth.getNonNullableWorkspace().id,
      },
    });

    const mainAgentId = agentMessage?.agentMessage?.agentConfigurationId;

    if (!mainAgentId) {
      return new Ok(agentConfiguration);
    }

    const mainAgent = await getAgentConfiguration(auth, {
      agentId: mainAgentId,
      variant: "full",
    });
    if (!mainAgent) {
      return new Ok(agentConfiguration);
    }

    agentConfiguration.instructions =
      (mainAgent.instructions ?? "") +
      "\n\n" +
      (agentConfiguration.instructions ?? "");

    // Add the actions from the main agent to the agent configuration
    agentConfiguration.actions.push(...mainAgent.actions);

    const serverSideActions = mainAgent.actions.filter(
      isServerSideMCPServerConfiguration
    );

    const allDataSourceConfigurations = serverSideActions.flatMap(
      (action) => action.dataSources ?? []
    );
    const allTablesDataSourceConfigurations = serverSideActions.flatMap(
      (action) => action.tables ?? []
    );

    const allDataSourceViews = await fetchDataSourceViews(
      auth,
      [
        ...allDataSourceConfigurations,
        ...allTablesDataSourceConfigurations,
      ].map((item) => item.dataSourceViewId)
    );

    // Enhance DataSourceFileSystemAction
    const dataSourceViewsForFileSystem = createDataSourceViewsForFileSystem(
      allDataSourceConfigurations,
      allDataSourceViews
    );

    await mergeDataSourceFileSystemAction(
      auth,
      agentConfiguration,
      allDataSourceConfigurations,
      dataSourceViewsForFileSystem
    );

    // Enhance DataWarehousesAction
    const dataSourceViewsForTables = createDataSourceViewsForTables(
      allTablesDataSourceConfigurations,
      allDataSourceViews
    );

    await mergeDataWarehousesAction(
      auth,
      agentConfiguration,
      dataSourceViewsForTables
    );

    return new Ok(agentConfiguration);
  } catch (error) {
    return new Err(error instanceof Error ? error : new Error(String(error)));
  }
}
