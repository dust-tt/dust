import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import {
  getDataSourceFileSystemAction,
  getDataWarehousesAction,
} from "@app/lib/api/assistant/global_agents/configurations/dust/dust-deep";
import { fetchMessage } from "@app/lib/api/assistant/messages";
import { getDataSourceViewIdsFromActions } from "@app/lib/api/assistant/permissions";
import type { Authenticator } from "@app/lib/auth";
import { isRemoteDatabase } from "@app/lib/data_sources";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { AgentMessageType, Result, UserMessageType } from "@app/types";
import { Err, Ok } from "@app/types";
import type { AgentConfigurationType } from "@app/types/assistant/agent";

export async function augmentDustDeep(
  auth: Authenticator,
  agentConfiguration: AgentConfigurationType,
  agentMessage: AgentMessageType,
  userMessage: UserMessageType
): Promise<Result<AgentConfigurationType, Error>> {
  try {
    const agentMessageId = userMessage.context.originMessageId;
    const originMessage = agentMessageId
      ? await fetchMessage(auth, agentMessageId)
      : null;

    const mainAgentId = originMessage?.agentMessage?.agentConfigurationId;

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

    const dsViews = await DataSourceViewResource.fetchByIds(
      auth,
      getDataSourceViewIdsFromActions(mainAgent.actions)
    );
    const spaceIds = dsViews.map((item) => item.space);
    const allSpacesViews = await DataSourceViewResource.listBySpaces(
      auth,
      spaceIds
    );

    // Replace the datasource and datawarehouses actions with the new ones
    agentConfiguration.actions = agentConfiguration.actions.filter(
      (action) =>
        action.sId !== "dust-deep-data-source-file-system-action" &&
        action.sId !== "dust-deep-data-warehouses-action"
    );

    const dataSourceFileSystemMCPServerView =
      await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
        auth,
        "data_sources_file_system"
      );

    const newDataSourceFileSystemAction = getDataSourceFileSystemAction(
      allSpacesViews
        .filter((item) => item.dataSource.connectorProvider !== "webcrawler")
        .map((item) => item.toJSON()),
      auth.getNonNullableWorkspace().sId,
      dataSourceFileSystemMCPServerView
    );

    const dataWarehousesMCPServerView =
      await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
        auth,
        "data_warehouses"
      );

    const newDataWarehousesAction = getDataWarehousesAction(
      allSpacesViews
        .filter((item) => isRemoteDatabase(item.dataSource))
        .map((item) => item.toJSON()),
      auth.getNonNullableWorkspace().sId,
      dataWarehousesMCPServerView
    );

    if (newDataSourceFileSystemAction) {
      agentConfiguration.actions.push(newDataSourceFileSystemAction);
    }

    if (newDataWarehousesAction) {
      agentConfiguration.actions.push(newDataWarehousesAction);
    }

    return new Ok(agentConfiguration);
  } catch (error) {
    return new Err(error instanceof Error ? error : new Error(String(error)));
  }
}
