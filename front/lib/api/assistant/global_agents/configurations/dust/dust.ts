import { DEFAULT_AGENT_ROUTER_ACTION_NAME } from "@app/lib/actions/constants";
import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import { TOOL_NAME_SEPARATOR } from "@app/lib/actions/mcp_actions";
import {
  autoInternalMCPServerNameToSId,
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import { SUGGEST_AGENTS_TOOL_NAME } from "@app/lib/actions/mcp_internal_actions/servers/agent_router";
import { DEEP_DIVE_NAME } from "@app/lib/api/assistant/global_agents/configurations/dust/consts";
import {
  getCompanyDataAction,
  getCompanyDataWarehousesAction,
} from "@app/lib/api/assistant/global_agents/configurations/dust/shared";
import { globalAgentGuidelines } from "@app/lib/api/assistant/global_agents/guidelines";
import type { PrefetchedDataSourcesType } from "@app/lib/api/assistant/global_agents/tools";
import {
  _getAgentRouterToolsConfiguration,
  _getDefaultWebActionsForGlobalAgent,
  _getInteractiveContentToolConfiguration,
  _getToolsetsToolsConfiguration,
} from "@app/lib/api/assistant/global_agents/tools";
import { dummyModelConfiguration } from "@app/lib/api/assistant/global_agents/utils";
import type { Authenticator } from "@app/lib/auth";
import type { GlobalAgentSettingsModel } from "@app/lib/models/agent/agent";
import type { AgentMemoryResource } from "@app/lib/resources/agent_memory_resource";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { timeAgoFrom } from "@app/lib/utils";
import type {
  AgentConfigurationType,
  AgentModelConfigurationType,
  ModelConfigurationType,
  ReasoningEffort,
} from "@app/types";
import {
  CLAUDE_4_5_OPUS_DEFAULT_MODEL_CONFIG,
  CLAUDE_4_5_SONNET_DEFAULT_MODEL_CONFIG,
  GEMINI_3_PRO_MODEL_CONFIG,
  getLargeWhitelistedModel,
  getSmallWhitelistedModel,
  GLOBAL_AGENTS_SID,
  GPT_5_2_MODEL_CONFIG,
  isProviderWhitelisted,
  MAX_STEPS_USE_PER_RUN_LIMIT,
} from "@app/types";

const INSTRUCTION_SECTIONS = {
  primary: `<primary_goal>
You are an AI agent created by Dust to answer questions using your internal knowledge, the public internet and the user's internal company data sources.
</primary_goal>

<general_guidelines>${globalAgentGuidelines}</general_guidelines>

<critical_thinking_guidelines>
Keep your thinking as short as possible.
</critical_thinking_guidelines>`,

  simpleRequests: `<instructions>
1. If the user's question requires information that is likely private or internal to the company
    (and therefore unlikely to be found on the public internet or within your own knowledge),
    you should search in the company's internal data sources to answer the question.
    Searching in all datasources is the default behavior unless the user has specified the location,
    in which case it is better to search only on the specific data source.
    It's important to not pick a restrictive timeframe unless it's explicitly requested or obviously needed.
    If no relevant information is found but the user's question seems to be internal to the company,
    you should use the ${DEFAULT_AGENT_ROUTER_ACTION_NAME}${TOOL_NAME_SEPARATOR}${SUGGEST_AGENTS_TOOL_NAME}
    tool to suggest an agent that might be able to handle the request.

2. If the user's question requires information that is recent and likely to be found on the public
    internet, you should use the internet to answer the question.
    That means performing web searches as needed and potentially browsing some webpages.

3. If it is not obvious whether the information would be included in the internal company data sources
    or on the public internet, you should both search the internal company data sources
    and the public internet before answering the user's question.

4. If the user's query requires neither internal company data nor recent public knowledge,
    you should answer without using any tool.
</instructions>`,

  complexRequests: `<request_complexity>
Always start by classifying requests as "simple" or "complex".
You must follow the appropriate guidelines for each case.

A request is complex if any of the following conditions are met:
- It requires deep exploration of the user's internal company data, understanding the structure of the company data, running several (3+) searches
- It requires doing several web searches, or browsing 3+ web pages
- It requires running SQL queries
- It requires 3+ steps of tool uses
- The user specifically asks for a "deep dive", a "deep research", a "comprehensive search", a "comprehensive analysis" or "comprehensive report" or other terms that indicate a deep research task

Any other request is considered "simple".

<complex_request_guidelines>
If the request is complex, do not handle it yourself.
Immediately delegate the request to the deep dive agent by using the \`deep_dive\` tool.
</complex_request_guidelines>

<simple_request_guidelines>
1. If the user's question requires information that is likely private or internal to the company
    (and therefore unlikely to be found on the public internet or within your own knowledge),
    you should search in the company's internal data sources to answer the question.
    Searching in all datasources is the default behavior unless the user has specified the location,
    in which case it is better to search only on the specific data source.
    It's important to not pick a restrictive timeframe unless it's explicitly requested or obviously needed.
    If no relevant information is found but the user's question seems to be internal to the company,
    you should use the ${DEFAULT_AGENT_ROUTER_ACTION_NAME}${TOOL_NAME_SEPARATOR}${SUGGEST_AGENTS_TOOL_NAME}
    tool to suggest an agent that might be able to handle the request.

2. If the user's question requires information that is recent and likely to be found on the public
    internet, you should use the internet to answer the question.
    That means performing web searches as needed and potentially browsing some webpages.

3. If it is not obvious whether the information would be included in the internal company data sources
    or on the public internet, you should both search the internal company data sources
    and the public internet before answering the user's question.

4. If the user's query requires neither internal company data nor recent public knowledge,
    you should answer without using any tool.
</simple_request_guidelines>
</request_complexity>`,

  companyData: `<company_data_guidelines>
Default behavior: optimize for speed by starting with \`semantic_search\`.
Provide \`nodeIds\` only when you already know the relevant folder(s) or document(s) to target;
otherwise, search across all available content and refine your query before exploring the tree.

Use tree-navigation tools when thoroughness is required:
- Use \`list\` to enumerate direct children of a node (folders and documents). If no node is provided, list from data source roots.
- Use \`find\` to locate nodes by title recursively from a given node (partial titles are OK). Helpful to narrow scope when search is too broad.
- Use \`locate_in_tree\` to display the full path from a node up to its data source root when you need to understand or show where it sits.

Search and reading:
- Use \`semantic_search\` to retrieve relevant content quickly. Pass \`nodeIds\` to limit scope only when needed; otherwise search globally.
- Use \`cat\` sparingly to extract short, relevant snippets you need to quote or verify facts. Prefer searching over reading large files end-to-end.

<cat_tool_guidelines>
ALWAYS provide a \`limit\` when using \`cat\`. The maximum \`limit\` is 10,000 characters. For long documents, read in chunks using \`offset\` and \`limit\`. Optionally use \`grep\` to narrow to relevant lines.
</cat_tool_guidelines>
</company_data_guidelines>`,

  warehouses: `<data_warehouses_guidelines>
You can use the Data Warehouses tools to:
- explore what tables are available in the user's data warehouses
- describe the tables structure
- execute a SQL query against a set of tables

In order to properly use the data warehouses, it is useful to also search through company data in case there is some documentation available about the tables, some additional semantic layer, or some code that may define how the tables are built in the first place.
Tables are identified by ids in the format 'table-<dataSourceId>-<nodeId>'.
The dataSourceId can typically be found by exploring the warehouse, each warehouse is identified by an id in the format 'warehouse-<dataSourceId>'.
A dataSourceId typically starts with the prefix "dts_".
</data_warehouses_guidelines>`,

  toolsets: (availableToolsets: MCPServerViewResource[]) => {
    const toolsetsList = availableToolsets
      // Sort by display name to ensure consistent order for LLM cache optimization.
      .sort((a, b) => {
        const aView = a.toJSON();
        const bView = b.toJSON();
        return getMcpServerViewDisplayName(aView).localeCompare(
          getMcpServerViewDisplayName(bView)
        );
      })
      .map((toolset) => {
        const mcpServerView = toolset.toJSON();
        const sId = mcpServerView.sId;
        const displayName = getMcpServerViewDisplayName(mcpServerView);
        const description = getMcpServerViewDescription(mcpServerView);
        return `- **${displayName}** (toolsetId: \`${sId}\`): ${description}`;
      })
      .join("\n");

    return `<toolsets_guidelines>
The "toolsets" tools allow listing and enabling additional tools.

<available_toolsets>
${toolsetsList.length > 0 ? toolsetsList : "No additional toolsets are currently available."}
</available_toolsets>

When encountering any request that might benefit from specialized tools, review the available toolsets above.
Enable relevant toolsets using \`toolsets__enable\` with the toolsetId (shown in backticks) before attempting to fulfill the request.
Never assume or reply that you cannot do something before checking if there's a relevant toolset available.
</toolsets_guidelines>`;
  },

  help: `<dust_platform_support_guidelines>
Follow these guidelines when the user unambiguously asks support questions specifically about how to use Dust features, or needs help understanding Dust.
If the request is ambiguous, or not clearly a support request about how to use the Dust platform, do not assume it is and do not follow these guidelines.
The vast majority of the time, the user is not asking for help with Dust.

1. Perform web searches using site:dust.tt to find up-to-date information about Dust and, at the same time, fetch https://docs.dust.tt/llms.txt to easily view the documentation site map.
2. Provide clear, straightforward answers with accuracy and empathy.
3. Use bullet points and steps to guide the user effectively.
4. NEVER invent features or capabilities that Dust does not have.
5. NEVER make promises about future features.
6. Only refer to URLs that are mentioned in the documentation or search results - do not make up URLs about Dust.
7. At the end of your answer about Dust, provide these helpful links:
   - Official documentation: https://docs.dust.tt
   - Community support on Slack: https://dust-community.tightknit.community/join

Examples of help queries:
- "How do I create an agent in Dust?"
- "What are Dust's data source capabilities?"
- "Can Dust integrate with Slack?"
- "How does Dust's memory feature work?"

Remember: Always base your answers on the documentation. If you don't know the answer after searching, be honest about it.
</dust_platform_support_guidelines>`,

  memory: (memories: AgentMemoryResource[]) => {
    const memoryList = memories.length
      ? memories.map(formatMemory).join("\n")
      : "No existing memories.";

    return `<memory_guidelines>
You have access to a persistent, user-specific memory system. Each user has their own private memory store.

<critical_behavior>
Existing memories are critical to your success. Always use them to tailor your responses and improve your performance over time.
They are available to you directly in the <existing_memories> section.
To add or edit memories, use the \`agent_memory\` tool.
</critical_behavior>

<memory_strategy>
Think of memories as building a "user manual" for each person you interact with:
- Extract salient facts worth remembering (use judgment - not everything is memory-worthy)
- Consolidate similar memories to avoid redundancy
- Update facts when they change rather than accumulating outdated versions
- Memories should enable you to provide increasingly personalized and efficient help over time
</memory_strategy>

<what_to_remember>
High-value memories (always save):
- Identity & role: job title, team structure, responsibilities
- Preferences: communication style, detail level, format preferences
- Context: ongoing projects, goals, deadlines, constraints
- Expertise: knowledge level, skills, areas where they need support
- Decisions: technical choices, strategic directions, agreed approaches
- Tools & workflows: software they use, processes they follow

Low-value memories (usually skip):
- Temporal states: "working on X today", "currently debugging"
- One-off queries without broader context
- Information readily available in their data sources
</what_to_remember>

<memory_usage>
Use memories to:
- Skip redundant questions (e.g., don't ask their role if you know it)
- Tailor complexity to their expertise level automatically
- Proactively offer relevant suggestions based on their patterns
- Maintain continuity across conversations (reference past decisions naturally)
- Adapt tone and format to their preferences without being asked

Never explicitly say "I remember" or "based on our previous conversation" - just apply the context naturally.
</memory_usage>

<memory_hygiene>
- Write atomic, factual statements (e.g., "CFO at Series B startup, 50 employees")
- Include temporal markers when relevant (e.g., "Migrating to AWS - started Jan 2025")
- Edit existing memories when facts change rather than creating new ones
- Erase memories that become irrelevant or that users ask you to forget
</memory_hygiene>
</memory_guidelines>

<existing_memories>
${memoryList.trim()}
</existing_memories>`;
  },
};

const formatMemory = (memory: AgentMemoryResource) =>
  `- ${memory.content} (${timeAgoFrom(new Date(memory.updatedAt).getTime())} ago).`;

function buildInstructions({
  hasDeepDive,
  hasFilesystemTools,
  hasDataWarehouses,
  hasAgentMemory,
  hasToolsets,
  memories,
  availableToolsets,
}: {
  hasDeepDive: boolean;
  hasFilesystemTools: boolean;
  hasDataWarehouses: boolean;
  hasAgentMemory: boolean;
  hasToolsets: boolean;
  memories: AgentMemoryResource[];
  availableToolsets: MCPServerViewResource[];
}): string {
  const parts: string[] = [
    INSTRUCTION_SECTIONS.primary,
    hasDeepDive
      ? INSTRUCTION_SECTIONS.complexRequests
      : INSTRUCTION_SECTIONS.simpleRequests,
    hasFilesystemTools && INSTRUCTION_SECTIONS.companyData,
    hasDataWarehouses && INSTRUCTION_SECTIONS.warehouses,
    hasToolsets && INSTRUCTION_SECTIONS.toolsets(availableToolsets),
    INSTRUCTION_SECTIONS.help,
    hasAgentMemory && INSTRUCTION_SECTIONS.memory(memories),
  ].filter((part): part is string => typeof part === "string");

  return parts.join("\n\n");
}

function _getDustLikeGlobalAgent(
  auth: Authenticator,
  {
    settings,
    preFetchedDataSources,
    agentRouterMCPServerView,
    webSearchBrowseMCPServerView,
    dataSourcesFileSystemMCPServerView,
    toolsetsMCPServerView,
    deepDiveMCPServerView,
    interactiveContentMCPServerView,
    dataWarehousesMCPServerView,

    agentMemoryMCPServerView,
    memories,
    availableToolsets,
  }: {
    settings: GlobalAgentSettingsModel | null;
    preFetchedDataSources: PrefetchedDataSourcesType | null;
    agentRouterMCPServerView: MCPServerViewResource | null;
    webSearchBrowseMCPServerView: MCPServerViewResource | null;
    dataSourcesFileSystemMCPServerView: MCPServerViewResource | null;
    toolsetsMCPServerView: MCPServerViewResource | null;
    deepDiveMCPServerView: MCPServerViewResource | null;
    interactiveContentMCPServerView: MCPServerViewResource | null;
    dataWarehousesMCPServerView: MCPServerViewResource | null;
    agentMemoryMCPServerView: MCPServerViewResource | null;
    memories: AgentMemoryResource[];
    availableToolsets: MCPServerViewResource[];
  },
  {
    agentId,
    name,
    preferredModelConfiguration,
    preferredReasoningEffort,
  }: {
    agentId: GLOBAL_AGENTS_SID;
    name: string;
    preferredModelConfiguration?: ModelConfigurationType | null;
    preferredReasoningEffort?: ReasoningEffort;
  }
): AgentConfigurationType | null {
  const owner = auth.getNonNullableWorkspace();

  const description = "An agent with context on your company data.";
  const pictureUrl = "https://dust.tt/static/systemavatar/dust_avatar_full.png";

  let isPreferredModel = false;

  const modelConfiguration = (() => {
    if (!auth.isUpgraded()) {
      return getSmallWhitelistedModel(owner);
    }

    if (preferredModelConfiguration) {
      if (
        isProviderWhitelisted(owner, preferredModelConfiguration.providerId)
      ) {
        isPreferredModel = true;
        return preferredModelConfiguration;
      }
    }

    return getLargeWhitelistedModel(owner);
  })();

  let model: AgentModelConfigurationType;
  if (modelConfiguration) {
    model = {
      providerId: modelConfiguration.providerId,
      modelId: modelConfiguration.modelId,
      temperature: 0.7,
      reasoningEffort:
        isPreferredModel && preferredReasoningEffort
          ? preferredReasoningEffort
          : modelConfiguration.defaultReasoningEffort,
    };
  } else {
    model = dummyModelConfiguration;
  }

  const hasFilesystemTools = dataSourcesFileSystemMCPServerView !== null;

  const hasAgentMemory = agentMemoryMCPServerView !== null;
  const hasToolsets = toolsetsMCPServerView !== null;

  // Filter available toolsets (similar to toolsets>list logic): tools with no requirements and not auto-hidden.
  const filteredAvailableToolsets = availableToolsets.filter((toolset) => {
    const mcpServerView = toolset.toJSON();
    return (
      getMCPServerRequirements(mcpServerView).noRequirement &&
      mcpServerView.server.availability !== "auto_hidden_builder"
    );
  });

  const dataWarehousesAction = getCompanyDataWarehousesAction(
    preFetchedDataSources,
    dataWarehousesMCPServerView
  );

  const instructions = buildInstructions({
    hasDeepDive: !!deepDiveMCPServerView,
    hasFilesystemTools,
    hasDataWarehouses: !!dataWarehousesAction,
    hasAgentMemory,
    hasToolsets,
    availableToolsets: filteredAvailableToolsets,
    memories,
  });

  const dustAgent = {
    id: -1,
    sId: agentId,
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
    templateId: null,
    requestedGroupIds: [],
    requestedSpaceIds: [],
    tags: [],
    canRead: true,
    canEdit: false,
  };

  if (
    (settings && settings.status === "disabled_by_admin") ||
    !modelConfiguration
  ) {
    return {
      ...dustAgent,
      status: "disabled_by_admin",
      actions: [
        ..._getDefaultWebActionsForGlobalAgent({
          agentId,
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

  // Add the filesystem tools action with all data sources in the global space.
  if (hasFilesystemTools) {
    const companyDataAction = getCompanyDataAction(
      preFetchedDataSources,
      dataSourcesFileSystemMCPServerView
    );
    if (companyDataAction) {
      actions.push(companyDataAction);
    }
  }

  if (dataWarehousesAction) {
    actions.push(dataWarehousesAction);
  }

  actions.push(
    ..._getDefaultWebActionsForGlobalAgent({
      agentId,
      webSearchBrowseMCPServerView,
    }),
    ..._getToolsetsToolsConfiguration({
      agentId,
      toolsetsMcpServerView: toolsetsMCPServerView,
    }),
    ..._getAgentRouterToolsConfiguration(
      agentId,
      agentRouterMCPServerView,
      autoInternalMCPServerNameToSId({
        name: "agent_router",
        workspaceId: owner.id,
      })
    )
  );

  if (deepDiveMCPServerView) {
    actions.push({
      id: -1,
      sId: agentId + "-deep-dive",
      type: "mcp_server_configuration",
      name: "deep_dive" satisfies InternalMCPServerNameType,
      description: `Handoff the query to the @${DEEP_DIVE_NAME} agent`,
      mcpServerViewId: deepDiveMCPServerView.sId,
      internalMCPServerId: deepDiveMCPServerView.internalMCPServerId,
      dataSources: null,
      tables: null,
      childAgentId: null,
      reasoningModel: null,
      additionalConfiguration: {},
      timeFrame: null,
      dustAppConfiguration: null,
      jsonSchema: null,
      secretName: null,
    });
  }

  if (hasAgentMemory) {
    actions.push({
      id: -1,
      sId: agentId + "-agent-memory",
      type: "mcp_server_configuration",
      name: "agent_memory" satisfies InternalMCPServerNameType,
      description: "The agent memory tool",
      mcpServerViewId: agentMemoryMCPServerView.sId,
      internalMCPServerId: agentMemoryMCPServerView.internalMCPServerId,
      dataSources: null,
      tables: null,
      childAgentId: null,
      reasoningModel: null,
      additionalConfiguration: {},
      timeFrame: null,
      dustAppConfiguration: null,
      jsonSchema: null,
      secretName: null,
    });
  }

  actions.push(
    ..._getInteractiveContentToolConfiguration({
      agentId,
      interactiveContentMCPServerView,
    })
  );

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

export function _getDustGlobalAgent(
  auth: Authenticator,
  args: {
    settings: GlobalAgentSettingsModel | null;
    preFetchedDataSources: PrefetchedDataSourcesType | null;
    agentRouterMCPServerView: MCPServerViewResource | null;
    webSearchBrowseMCPServerView: MCPServerViewResource | null;
    dataSourcesFileSystemMCPServerView: MCPServerViewResource | null;
    toolsetsMCPServerView: MCPServerViewResource | null;
    deepDiveMCPServerView: MCPServerViewResource | null;
    interactiveContentMCPServerView: MCPServerViewResource | null;
    dataWarehousesMCPServerView: MCPServerViewResource | null;
    agentMemoryMCPServerView: MCPServerViewResource | null;
    memories: AgentMemoryResource[];
    availableToolsets: MCPServerViewResource[];
  }
): AgentConfigurationType | null {
  return _getDustLikeGlobalAgent(auth, args, {
    agentId: GLOBAL_AGENTS_SID.DUST,
    name: "dust",
    preferredModelConfiguration: CLAUDE_4_5_SONNET_DEFAULT_MODEL_CONFIG,
  });
}

export function _getDustEdgeGlobalAgent(
  auth: Authenticator,
  args: {
    settings: GlobalAgentSettingsModel | null;
    preFetchedDataSources: PrefetchedDataSourcesType | null;
    agentRouterMCPServerView: MCPServerViewResource | null;
    webSearchBrowseMCPServerView: MCPServerViewResource | null;
    dataSourcesFileSystemMCPServerView: MCPServerViewResource | null;
    toolsetsMCPServerView: MCPServerViewResource | null;
    deepDiveMCPServerView: MCPServerViewResource | null;
    interactiveContentMCPServerView: MCPServerViewResource | null;
    dataWarehousesMCPServerView: MCPServerViewResource | null;
    agentMemoryMCPServerView: MCPServerViewResource | null;
    memories: AgentMemoryResource[];
    availableToolsets: MCPServerViewResource[];
  }
): AgentConfigurationType | null {
  return _getDustLikeGlobalAgent(auth, args, {
    agentId: GLOBAL_AGENTS_SID.DUST_EDGE,
    name: "dust-edge",
    preferredModelConfiguration: CLAUDE_4_5_OPUS_DEFAULT_MODEL_CONFIG,
    preferredReasoningEffort: "light",
  });
}

export function _getDustQuickGlobalAgent(
  auth: Authenticator,
  args: {
    settings: GlobalAgentSettingsModel | null;
    preFetchedDataSources: PrefetchedDataSourcesType | null;
    agentRouterMCPServerView: MCPServerViewResource | null;
    webSearchBrowseMCPServerView: MCPServerViewResource | null;
    dataSourcesFileSystemMCPServerView: MCPServerViewResource | null;
    toolsetsMCPServerView: MCPServerViewResource | null;
    deepDiveMCPServerView: MCPServerViewResource | null;
    interactiveContentMCPServerView: MCPServerViewResource | null;
    dataWarehousesMCPServerView: MCPServerViewResource | null;
    agentMemoryMCPServerView: MCPServerViewResource | null;
    memories: AgentMemoryResource[];
    availableToolsets: MCPServerViewResource[];
  }
): AgentConfigurationType | null {
  return _getDustLikeGlobalAgent(auth, args, {
    agentId: GLOBAL_AGENTS_SID.DUST_QUICK,
    name: "dust-quick",
    preferredModelConfiguration: GEMINI_3_PRO_MODEL_CONFIG,
    preferredReasoningEffort: "light",
  });
}

export function _getDustOaiGlobalAgent(
  auth: Authenticator,
  args: {
    settings: GlobalAgentSettingsModel | null;
    preFetchedDataSources: PrefetchedDataSourcesType | null;
    agentRouterMCPServerView: MCPServerViewResource | null;
    webSearchBrowseMCPServerView: MCPServerViewResource | null;
    dataSourcesFileSystemMCPServerView: MCPServerViewResource | null;
    toolsetsMCPServerView: MCPServerViewResource | null;
    deepDiveMCPServerView: MCPServerViewResource | null;
    interactiveContentMCPServerView: MCPServerViewResource | null;
    dataWarehousesMCPServerView: MCPServerViewResource | null;
    agentMemoryMCPServerView: MCPServerViewResource | null;
    memories: AgentMemoryResource[];
    availableToolsets: MCPServerViewResource[];
  }
): AgentConfigurationType | null {
  return _getDustLikeGlobalAgent(auth, args, {
    agentId: GLOBAL_AGENTS_SID.DUST_OAI,
    name: "dust-oai",
    preferredModelConfiguration: GPT_5_2_MODEL_CONFIG,
    preferredReasoningEffort: "light",
  });
}
