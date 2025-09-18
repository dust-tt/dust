import { DEFAULT_AGENT_ROUTER_ACTION_NAME } from "@app/lib/actions/constants";
import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import { TOOL_NAME_SEPARATOR } from "@app/lib/actions/mcp_actions";
import { autoInternalMCPServerNameToSId } from "@app/lib/actions/mcp_helper";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { SUGGEST_AGENTS_TOOL_NAME } from "@app/lib/actions/mcp_internal_actions/servers/agent_router";
import { globalAgentGuidelines } from "@app/lib/api/assistant/global_agents/guidelines";
import type { PrefetchedDataSourcesType } from "@app/lib/api/assistant/global_agents/tools";
import {
  _getAgentRouterToolsConfiguration,
  _getDefaultWebActionsForGlobalAgent,
} from "@app/lib/api/assistant/global_agents/tools";
import { dummyModelConfiguration } from "@app/lib/api/assistant/global_agents/utils";
import type { Authenticator } from "@app/lib/auth";
import type { GlobalAgentSettings } from "@app/lib/models/assistant/agent";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type {
  AgentConfigurationType,
  AgentModelConfigurationType,
} from "@app/types";
import {
  getLargeWhitelistedModel,
  getSmallWhitelistedModel,
  GLOBAL_AGENTS_SID,
  MAX_STEPS_USE_PER_RUN_LIMIT,
} from "@app/types";

export function _getDustGlobalAgent(
  auth: Authenticator,
  {
    settings,
    preFetchedDataSources,
    agentRouterMCPServerView,
    webSearchBrowseMCPServerView,
    searchMCPServerView,
    deepResearchMCPServerView,
  }: {
    settings: GlobalAgentSettings | null;
    preFetchedDataSources: PrefetchedDataSourcesType | null;
    agentRouterMCPServerView: MCPServerViewResource | null;
    webSearchBrowseMCPServerView: MCPServerViewResource | null;
    searchMCPServerView: MCPServerViewResource | null;
    deepResearchMCPServerView: MCPServerViewResource | null;
  }
): AgentConfigurationType | null {
  const owner = auth.getNonNullableWorkspace();

  const name = "dust";
  const description = "An agent with context on your company data.";
  const pictureUrl = "https://dust.tt/static/systemavatar/dust_avatar_full.png";

  const modelConfiguration = auth.isUpgraded()
    ? getLargeWhitelistedModel(owner)
    : getSmallWhitelistedModel(owner);

  const model: AgentModelConfigurationType = modelConfiguration
    ? {
        providerId: modelConfiguration.providerId,
        modelId: modelConfiguration.modelId,
        temperature: 0.7,
        reasoningEffort: modelConfiguration.defaultReasoningEffort,
      }
    : dummyModelConfiguration;

  const instructions = `${globalAgentGuidelines}
  The agent should not provide additional information or content that the user did not ask for.
  
  # When the user asks a question to the agent, the agent should analyze the situation as follows:
  
  1. If the user's question requires information that is likely private or internal to the company
     (and therefore unlikely to be found on the public internet or within the agent's own knowledge),
     the agent should search in the company's internal data sources to answer the question.
     Searching in all datasources is the default behavior unless the user has specified the location,
     in which case it is better to search only on the specific data source.
     It's important to not pick a restrictive timeframe unless it's explicitly requested or obviously needed.
     If no relevant information is found but the user's question seems to be internal to the company,
     the agent should use the ${DEFAULT_AGENT_ROUTER_ACTION_NAME}${TOOL_NAME_SEPARATOR}${SUGGEST_AGENTS_TOOL_NAME}
     tool to suggest an agent that might be able to handle the request.
  
  2. If the user's question requires information that is recent and likely to be found on the public 
     internet, the agent should use the internet to answer the question.
     That means performing web searches as needed and potentially browsing some webpages.
  
  3. If it is not obvious whether the information would be included in the internal company data sources
     or on the public internet, the agent should both search the internal company data sources
     and the public internet before answering the user's question.
  
  4. If the user's query requires neither internal company data nor recent public knowledge,
     the agent is allowed to answer without using any tool.`;

  const dustAgent = {
    id: -1,
    sId: GLOBAL_AGENTS_SID.DUST,
    version: 0,
    versionCreatedAt: null,
    versionAuthorId: null,
    name,
    description,
    instructions,
    pictureUrl,
    scope: "global" as const,
    userFavorite: false,
    model,
    visualizationEnabled: true,
    templateId: null,
    requestedGroupIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };

  if (
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    (settings && settings.status === "disabled_by_admin") ||
    !modelConfiguration
  ) {
    return {
      ...dustAgent,
      status: "disabled_by_admin",
      actions: [
        ..._getDefaultWebActionsForGlobalAgent({
          agentId: GLOBAL_AGENTS_SID.DUST,
          webSearchBrowseMCPServerView,
        }),
      ],
      maxStepsPerRun: 0,
    };
  }

  // This only happens when we fetch the list version of the agent.
  if (!preFetchedDataSources) {
    return {
      ...dustAgent,
      status: "active",
      actions: [],
      maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
    };
  }

  const actions: MCPServerConfigurationType[] = [];

  const dataSourceViews = preFetchedDataSources.dataSourceViews.filter(
    (dsView) => dsView.dataSource.assistantDefaultSelected === true
  );

  // Only add the action if there are data sources and the search MCPServer is available.
  if (dataSourceViews.length > 0 && searchMCPServerView) {
    // We push one action with all data sources
    actions.push({
      id: -1,
      sId: GLOBAL_AGENTS_SID.DUST + "-datasource-action",
      type: "mcp_server_configuration",
      name: "search_all_data_sources",
      description: "The user's entire workspace data sources",
      mcpServerViewId: searchMCPServerView.sId,
      internalMCPServerId: searchMCPServerView.internalMCPServerId,
      dataSources: dataSourceViews.map((dsView) => ({
        dataSourceViewId: dsView.sId,
        workspaceId: preFetchedDataSources.workspaceId,
        filter: { parents: null, tags: null },
      })),
      tables: null,
      childAgentId: null,
      reasoningModel: null,
      additionalConfiguration: {},
      timeFrame: null,
      dustAppConfiguration: null,
      jsonSchema: null,
    });

    // Add one action per managed data source to improve search results for queries like
    // "search in <data_source>".
    // Only include data sources from the global space to limit actions for the same
    // data source.
    // Hack: Prefix action names with "hidden_" to prevent them from appearing in the UI,
    // avoiding duplicate display of data sources.
    dataSourceViews.forEach((dsView) => {
      if (
        dsView.dataSource.connectorProvider &&
        dsView.dataSource.connectorProvider !== "webcrawler" &&
        dsView.isInGlobalSpace
      ) {
        actions.push({
          id: -1,
          sId:
            GLOBAL_AGENTS_SID.DUST +
            "-datasource-action-" +
            dsView.dataSource.sId,
          type: "mcp_server_configuration",
          name: "hidden_dust_search_" + dsView.dataSource.name,
          description: `The user's ${dsView.dataSource.connectorProvider} data source.`,
          mcpServerViewId: searchMCPServerView.sId,
          internalMCPServerId: searchMCPServerView.internalMCPServerId,
          dataSources: [
            {
              workspaceId: preFetchedDataSources.workspaceId,
              dataSourceViewId: dsView.sId,
              filter: { parents: null, tags: null },
            },
          ],
          tables: null,
          childAgentId: null,
          reasoningModel: null,
          additionalConfiguration: {},
          timeFrame: null,
          dustAppConfiguration: null,
          jsonSchema: null,
        });
      }
    });
  }

  actions.push(
    ..._getDefaultWebActionsForGlobalAgent({
      agentId: GLOBAL_AGENTS_SID.DUST,
      webSearchBrowseMCPServerView,
    }),
    ..._getAgentRouterToolsConfiguration(
      GLOBAL_AGENTS_SID.DUST,
      agentRouterMCPServerView,
      autoInternalMCPServerNameToSId({
        name: "agent_router",
        workspaceId: owner.id,
      })
    )
  );

  if (deepResearchMCPServerView) {
    actions.push({
      id: -1,
      sId: GLOBAL_AGENTS_SID.DUST + "-deep-research",
      type: "mcp_server_configuration",
      name: "deep_research" satisfies InternalMCPServerNameType,
      description: "Deep research agent",
      mcpServerViewId: deepResearchMCPServerView.sId,
      internalMCPServerId: deepResearchMCPServerView.internalMCPServerId,
      dataSources: null,
      tables: null,
      childAgentId: null,
      reasoningModel: null,
      additionalConfiguration: {},
      timeFrame: null,
      dustAppConfiguration: null,
      jsonSchema: null,
    });
  }

  // Fix the action ids.
  actions.forEach((action, i) => {
    action.id = -i;
  });

  return {
    ...dustAgent,
    status: "active",
    actions,
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
  };
}
