import {
  DEFAULT_AGENT_ROUTER_ACTION_DESCRIPTION,
  DEFAULT_AGENT_ROUTER_ACTION_NAME,
  DEFAULT_WEBSEARCH_ACTION_DESCRIPTION,
  DEFAULT_WEBSEARCH_ACTION_NAME,
} from "@app/lib/actions/constants";
import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { DataSourceViewType } from "@app/types";
import type { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";

export type PrefetchedDataSourcesType = {
  dataSourceViews: (DataSourceViewType & { isInGlobalSpace: boolean })[];
  workspaceId: string;
};

export async function getDataSourcesAndWorkspaceIdForGlobalAgents(
  auth: Authenticator
): Promise<PrefetchedDataSourcesType> {
  const owner = auth.getNonNullableWorkspace();
  const dsvs = await DataSourceViewResource.listAllInGlobalGroup(auth);

  return {
    dataSourceViews: dsvs.map((dsv) => {
      return {
        ...dsv.toJSON(),
        isInGlobalSpace: dsv.space.isGlobal(),
      };
    }),
    workspaceId: owner.sId,
  };
}

export function _getDefaultWebActionsForGlobalAgent({
  agentId,
  webSearchBrowseMCPServerView,
}: {
  agentId: GLOBAL_AGENTS_SID;
  webSearchBrowseMCPServerView: MCPServerViewResource | null;
}): ServerSideMCPServerConfigurationType[] {
  if (!webSearchBrowseMCPServerView) {
    return [];
  }

  return [
    {
      id: -1,
      sId: agentId + "-websearch-browse-action",
      type: "mcp_server_configuration",
      name: DEFAULT_WEBSEARCH_ACTION_NAME satisfies InternalMCPServerNameType,
      description: DEFAULT_WEBSEARCH_ACTION_DESCRIPTION,
      mcpServerViewId: webSearchBrowseMCPServerView.sId,
      internalMCPServerId: webSearchBrowseMCPServerView.internalMCPServerId,
      dataSources: null,
      tables: null,
      childAgentId: null,
      reasoningModel: null,
      additionalConfiguration: {},
      timeFrame: null,
      dustAppConfiguration: null,
      jsonSchema: null,
      secretName: null,
    },
  ];
}

export function _getToolsetsToolsConfiguration({
  agentId,
  toolsetsMcpServerView,
}: {
  agentId: GLOBAL_AGENTS_SID;
  toolsetsMcpServerView: MCPServerViewResource | null;
}): ServerSideMCPServerConfigurationType[] {
  if (!toolsetsMcpServerView) {
    return [];
  }

  return [
    {
      id: -1,
      sId: agentId + "-toolsets",
      type: "mcp_server_configuration",
      name: "toolsets",
      description:
        "List the available tools with their names and descriptions.",
      mcpServerViewId: toolsetsMcpServerView.sId,
      internalMCPServerId: toolsetsMcpServerView.internalMCPServerId,
      dataSources: null,
      tables: null,
      childAgentId: null,
      reasoningModel: null,
      additionalConfiguration: {},
      timeFrame: null,
      dustAppConfiguration: null,
      jsonSchema: null,
      secretName: null,
    },
  ];
}

export function _getAgentRouterToolsConfiguration(
  agentId: GLOBAL_AGENTS_SID,
  mcpServerView: MCPServerViewResource | null,
  internalMCPServerId: string
): ServerSideMCPServerConfigurationType[] {
  if (!mcpServerView) {
    return [];
  }
  return [
    {
      id: -1,
      sId: agentId + "-agent-router",
      type: "mcp_server_configuration",
      name: DEFAULT_AGENT_ROUTER_ACTION_NAME satisfies InternalMCPServerNameType,
      description: DEFAULT_AGENT_ROUTER_ACTION_DESCRIPTION,
      mcpServerViewId: mcpServerView.sId,
      internalMCPServerId,
      dataSources: null,
      tables: null,
      childAgentId: null,
      reasoningModel: null,
      additionalConfiguration: {},
      timeFrame: null,
      dustAppConfiguration: null,
      jsonSchema: null,
      secretName: null,
    },
  ];
}

export function _getInteractiveContentToolConfiguration({
  agentId,
  interactiveContentMCPServerView,
}: {
  agentId: GLOBAL_AGENTS_SID;
  interactiveContentMCPServerView: MCPServerViewResource | null;
}): ServerSideMCPServerConfigurationType[] {
  if (!interactiveContentMCPServerView) {
    return [];
  }

  return [
    {
      id: -1,
      sId: agentId + "-interactive-content",
      type: "mcp_server_configuration",
      name: "interactive_content",
      description: "Create & update Interactive Content files.",
      mcpServerViewId: interactiveContentMCPServerView.sId,
      internalMCPServerId: interactiveContentMCPServerView.internalMCPServerId,
      dataSources: null,
      tables: null,
      childAgentId: null,
      reasoningModel: null,
      additionalConfiguration: {},
      timeFrame: null,
      dustAppConfiguration: null,
      jsonSchema: null,
      secretName: null,
    },
  ];
}
