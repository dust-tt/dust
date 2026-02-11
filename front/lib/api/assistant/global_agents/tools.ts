import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import { autoInternalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import type { AutoInternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  AGENT_ROUTER_ACTION_DESCRIPTION,
  AGENT_ROUTER_SERVER_NAME,
} from "@app/lib/api/actions/servers/agent_router/metadata";
import {
  WEB_SEARCH_BROWSE_ACTION_DESCRIPTION,
  WEB_SEARCH_BROWSE_SERVER_NAME,
} from "@app/lib/api/actions/servers/web_search_browse/metadata";
import type { Authenticator } from "@app/lib/auth";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { AgentFetchVariant } from "@app/types/assistant/agent";
import type { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import type { DataSourceViewType } from "@app/types/data_source_view";

export type PrefetchedDataSourcesType = {
  dataSourceViews: (DataSourceViewType & { isInGlobalSpace: boolean })[];
  workspaceId: string;
};

export const MCP_SERVERS_FOR_GLOBAL_AGENTS: readonly AutoInternalMCPServerNameType[] =
  [
    "agent_router",
    "web_search_&_browse",
    "search",
    "data_sources_file_system",
    "run_agent",
    "toolsets",
    "data_warehouses",
    "slideshow",
    "agent_memory",
  ] as const;

export type MCPServerViewsForGlobalAgentsMap = Record<
  (typeof MCP_SERVERS_FOR_GLOBAL_AGENTS)[number],
  MCPServerViewResource | null
>;

export async function getMCPServerViewsForGlobalAgents(
  auth: Authenticator,
  variant: AgentFetchVariant
): Promise<MCPServerViewsForGlobalAgentsMap> {
  let allMCPServerViews: MCPServerViewResource[] = [];
  if (variant === "full") {
    allMCPServerViews =
      await MCPServerViewResource.getMCPServerViewsForAutoInternalTools(auth, [
        ...MCP_SERVERS_FOR_GLOBAL_AGENTS,
      ]);
  }

  const mcpServerViewsByServerId = new Map(
    allMCPServerViews.map((v) => [v.internalMCPServerId, v])
  );

  return Object.fromEntries(
    MCP_SERVERS_FOR_GLOBAL_AGENTS.map((name) => [
      name,
      mcpServerViewsByServerId.get(
        autoInternalMCPServerNameToSId({
          name,
          workspaceId: auth.getNonNullableWorkspace().id,
        })
      ) ?? null,
    ])
  ) as MCPServerViewsForGlobalAgentsMap;
}

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
  mcpServerViews,
}: {
  agentId: GLOBAL_AGENTS_SID;
  mcpServerViews: MCPServerViewsForGlobalAgentsMap;
}): ServerSideMCPServerConfigurationType[] {
  const { "web_search_&_browse": webSearchBrowseMCPServerView } =
    mcpServerViews;

  if (!webSearchBrowseMCPServerView) {
    return [];
  }

  return [
    {
      id: -1,
      sId: agentId + "-websearch-browse-action",
      type: "mcp_server_configuration",
      name: WEB_SEARCH_BROWSE_SERVER_NAME,
      description: WEB_SEARCH_BROWSE_ACTION_DESCRIPTION,
      mcpServerViewId: webSearchBrowseMCPServerView.sId,
      internalMCPServerId: webSearchBrowseMCPServerView.internalMCPServerId,
      dataSources: null,
      tables: null,
      childAgentId: null,
      additionalConfiguration: {},
      timeFrame: null,
      dustAppConfiguration: null,
      jsonSchema: null,
      secretName: null,
      dustProject: null,
    },
  ];
}

export function _getToolsetsToolsConfiguration({
  agentId,
  mcpServerViews,
}: {
  agentId: GLOBAL_AGENTS_SID;
  mcpServerViews: MCPServerViewsForGlobalAgentsMap;
}): ServerSideMCPServerConfigurationType[] {
  const { toolsets: toolsetsMcpServerView } = mcpServerViews;

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
      additionalConfiguration: {},
      timeFrame: null,
      dustAppConfiguration: null,
      jsonSchema: null,
      secretName: null,
      dustProject: null,
    },
  ];
}

export function _getAgentRouterToolsConfiguration({
  agentId,
  mcpServerViews,
}: {
  agentId: GLOBAL_AGENTS_SID;
  mcpServerViews: MCPServerViewsForGlobalAgentsMap;
}): ServerSideMCPServerConfigurationType[] {
  const { agent_router: agentRouterMCPServerView } = mcpServerViews;

  if (!agentRouterMCPServerView) {
    return [];
  }
  return [
    {
      id: -1,
      sId: agentId + "-agent-router",
      type: "mcp_server_configuration",
      name: AGENT_ROUTER_SERVER_NAME,
      description: AGENT_ROUTER_ACTION_DESCRIPTION,
      mcpServerViewId: agentRouterMCPServerView.sId,
      internalMCPServerId: agentRouterMCPServerView.internalMCPServerId,
      dataSources: null,
      tables: null,
      childAgentId: null,
      additionalConfiguration: {},
      timeFrame: null,
      dustAppConfiguration: null,
      jsonSchema: null,
      secretName: null,
      dustProject: null,
    },
  ];
}
