import { TOOL_NAME_SEPARATOR } from "@app/lib/actions/constants";
import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  AGENT_ROUTER_SERVER_NAME,
  SUGGEST_AGENTS_TOOL_NAME,
} from "@app/lib/api/actions/servers/agent_router/metadata";
import {
  getCompanyDataAction,
  getCompanyDataWarehousesAction,
} from "@app/lib/api/assistant/global_agents/configurations/dust/shared";
import { globalAgentGuidelines } from "@app/lib/api/assistant/global_agents/guidelines";
import type {
  MCPServerViewsForGlobalAgentsMap,
  PrefetchedDataSourcesType,
} from "@app/lib/api/assistant/global_agents/tools";
import {
  _getAgentRouterToolsConfiguration,
  _getDefaultWebActionsForGlobalAgent,
  _getToolsetsToolsConfiguration,
} from "@app/lib/api/assistant/global_agents/tools";
import { dummyModelConfiguration } from "@app/lib/api/assistant/global_agents/utils";
import type { Authenticator } from "@app/lib/auth";
import type { GlobalAgentSettingsModel } from "@app/lib/models/agent/agent";
import {
  isDustCompanyPlan,
  isEntreprisePlanPrefix,
} from "@app/lib/plans/plan_codes";
import type { AgentMemoryResource } from "@app/lib/resources/agent_memory_resource";
import type { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { formatTimestampToFriendlyDate } from "@app/lib/utils";
import type {
  AgentConfigurationType,
  AgentModelConfigurationType,
} from "@app/types/assistant/agent";
import { MAX_STEPS_USE_PER_RUN_LIMIT } from "@app/types/assistant/agent";
import {
  GLOBAL_AGENTS_SID,
  getLargeWhitelistedModel,
  getSmallWhitelistedModel,
} from "@app/types/assistant/assistant";
import { DUST_AVATAR_URL } from "@app/types/assistant/avatar";
import {
  CLAUDE_4_5_SONNET_DEFAULT_MODEL_CONFIG,
  CLAUDE_OPUS_4_6_DEFAULT_MODEL_CONFIG,
} from "@app/types/assistant/models/anthropic";
import { CUSTOM_MODEL_CONFIGS } from "@app/types/assistant/models/custom_models.generated";
import {
  FIREWORKS_GLM_5_MODEL_CONFIG,
  FIREWORKS_KIMI_K2P5_MODEL_CONFIG,
  FIREWORKS_MINIMAX_M2P5_MODEL_CONFIG,
} from "@app/types/assistant/models/fireworks";
import {
  GEMINI_3_FLASH_MODEL_CONFIG,
  GEMINI_3_PRO_MODEL_CONFIG,
} from "@app/types/assistant/models/google_ai_studio";
import { GPT_5_2_MODEL_CONFIG } from "@app/types/assistant/models/openai";
import { isProviderWhitelisted } from "@app/types/assistant/models/providers";
import type {
  ModelConfigurationType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";

interface DustLikeGlobalAgentArgs {
  settings: GlobalAgentSettingsModel | null;
  preFetchedDataSources: PrefetchedDataSourcesType | null;
  mcpServerViews: MCPServerViewsForGlobalAgentsMap;
  hasDeepDive: boolean;
}

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
    you should use the ${AGENT_ROUTER_SERVER_NAME}${TOOL_NAME_SEPARATOR}${SUGGEST_AGENTS_TOOL_NAME}
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
    you should use the ${AGENT_ROUTER_SERVER_NAME}${TOOL_NAME_SEPARATOR}${SUGGEST_AGENTS_TOOL_NAME}
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

  memory: `<memory_guidelines>
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
</memory_guidelines>`,
};

const formatMemory = (memory: AgentMemoryResource) =>
  `- ${memory.content} (saved ${formatTimestampToFriendlyDate(new Date(memory.updatedAt).getTime(), "compactWithDay")}).`;

export function buildMemoriesContext(memories: AgentMemoryResource[]): string {
  const memoryList = memories.length
    ? memories.map(formatMemory).join("\n")
    : "No existing memories.";

  return `
<existing_memories>
${memoryList.trim()}
</existing_memories>`;
}

export function buildToolsetsContext(
  availableToolsets: MCPServerViewResource[]
): string {
  const toolsetsList = availableToolsets
    .sort((a, b) => {
      const aView = a.toJSON();
      const bView = b.toJSON();
      const nameCompare = getMcpServerViewDisplayName(aView).localeCompare(
        getMcpServerViewDisplayName(bView)
      );
      if (nameCompare !== 0) {
        return nameCompare;
      }
      return aView.sId.localeCompare(bView.sId);
    })
    .map((toolset) => {
      const mcpServerView = toolset.toJSON();
      const sId = mcpServerView.sId;
      const displayName = getMcpServerViewDisplayName(mcpServerView);
      const description = getMcpServerViewDescription(mcpServerView);
      return `- **${displayName}** (toolsetId: \`${sId}\`): ${description}`;
    })
    .join("\n");

  return `
<toolsets_guidelines>
The "toolsets" tools allow listing and enabling additional tools.

<available_toolsets>
${toolsetsList.length > 0 ? toolsetsList : "No additional toolsets are currently available."}
</available_toolsets>

When encountering any request that might benefit from specialized tools, review the available toolsets above.
Enable relevant toolsets using \`toolsets__enable\` with the toolsetId (shown in backticks) before attempting to fulfill the request.
Never assume or reply that you cannot do something before checking if there's a relevant toolset available.
</toolsets_guidelines>`;
}

function buildInstructions({
  hasDeepDive,
  hasFilesystemTools,
  hasDataWarehouses,
  hasAgentMemory,
}: {
  hasDeepDive: boolean;
  hasFilesystemTools: boolean;
  hasDataWarehouses: boolean;
  hasAgentMemory: boolean;
}): string {
  const parts: string[] = [
    INSTRUCTION_SECTIONS.primary,
    hasDeepDive
      ? INSTRUCTION_SECTIONS.complexRequests
      : INSTRUCTION_SECTIONS.simpleRequests,
    hasFilesystemTools && INSTRUCTION_SECTIONS.companyData,
    hasDataWarehouses && INSTRUCTION_SECTIONS.warehouses,
    INSTRUCTION_SECTIONS.help,
    hasAgentMemory && INSTRUCTION_SECTIONS.memory,
  ].filter((part): part is string => typeof part === "string");

  return parts.join("\n\n");
}

function _getDustLikeGlobalAgent(
  auth: Authenticator,
  {
    settings,
    preFetchedDataSources,
    mcpServerViews,
    hasDeepDive,
  }: DustLikeGlobalAgentArgs,
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

  const { agent_memory: agentMemoryMCPServerView } = mcpServerViews;

  const description = `Dust is your general purpose agent. It has access to all of your company data and tools available in the Company space. Dust can help you:
- Find and analyze data across your company knowledge
- Research topics by searching the web
- Create content like documents, presentations, images, and dashboards`;
  const pictureUrl = DUST_AVATAR_URL;

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

  const hasAgentMemory = agentMemoryMCPServerView !== null;

  const companyDataAction = getCompanyDataAction(
    preFetchedDataSources,
    mcpServerViews
  );

  const dataWarehousesAction = getCompanyDataWarehousesAction(
    preFetchedDataSources,
    mcpServerViews
  );

  const instructions = buildInstructions({
    hasDeepDive,
    hasFilesystemTools: companyDataAction !== null,
    hasDataWarehouses: dataWarehousesAction !== null,
    hasAgentMemory,
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
    instructionsHtml: null,
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
          mcpServerViews,
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

  if (companyDataAction) {
    actions.push(companyDataAction);
  }

  if (dataWarehousesAction) {
    actions.push(dataWarehousesAction);
  }

  actions.push(
    ..._getDefaultWebActionsForGlobalAgent({
      agentId,
      mcpServerViews,
    }),
    ..._getToolsetsToolsConfiguration({
      agentId,
      mcpServerViews,
    }),
    ..._getAgentRouterToolsConfiguration({
      agentId,
      mcpServerViews,
    })
  );

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
      additionalConfiguration: {},
      timeFrame: null,
      dustAppConfiguration: null,
      jsonSchema: null,
      secretName: null,
      dustProject: null,
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
    skills: ["frames", "go-deep", "mention_users"],
    maxStepsPerRun: MAX_STEPS_USE_PER_RUN_LIMIT,
  };
}

export function shouldUseOpus(auth: Authenticator): boolean {
  const planCode = auth.plan()?.code ?? "";

  if (isDustCompanyPlan(planCode)) {
    return true;
  }

  if (!isEntreprisePlanPrefix(planCode)) {
    return false;
  }

  // Deterministic 50/50 split based on workspace sId.
  const sId = auth.getNonNullableWorkspace().sId;
  let hash = 0;
  for (let i = 0; i < sId.length; i++) {
    hash = (hash * 31 + sId.charCodeAt(i)) | 0;
  }
  return (hash & 1) === 0;
}

export function _getDustGlobalAgent(
  auth: Authenticator,
  args: DustLikeGlobalAgentArgs
): AgentConfigurationType | null {
  return _getDustLikeGlobalAgent(auth, args, {
    agentId: GLOBAL_AGENTS_SID.DUST,
    name: "dust",
    preferredModelConfiguration: shouldUseOpus(auth)
      ? CLAUDE_OPUS_4_6_DEFAULT_MODEL_CONFIG
      : CLAUDE_4_5_SONNET_DEFAULT_MODEL_CONFIG,
    preferredReasoningEffort: "light",
  });
}

export function _getDustEdgeGlobalAgent(
  auth: Authenticator,
  args: DustLikeGlobalAgentArgs
): AgentConfigurationType | null {
  return _getDustLikeGlobalAgent(auth, args, {
    agentId: GLOBAL_AGENTS_SID.DUST_EDGE,
    name: "dust-edge",
    preferredModelConfiguration: CLAUDE_OPUS_4_6_DEFAULT_MODEL_CONFIG,
    preferredReasoningEffort: "light",
  });
}

export function _getDustAntGlobalAgent(
  auth: Authenticator,
  args: DustLikeGlobalAgentArgs
): AgentConfigurationType | null {
  return _getDustLikeGlobalAgent(auth, args, {
    agentId: GLOBAL_AGENTS_SID.DUST_ANT,
    name: "dust-ant",
    preferredModelConfiguration: CLAUDE_OPUS_4_6_DEFAULT_MODEL_CONFIG,
    preferredReasoningEffort: "light",
  });
}

export function _getDustAntMediumGlobalAgent(
  auth: Authenticator,
  args: DustLikeGlobalAgentArgs
): AgentConfigurationType | null {
  return _getDustLikeGlobalAgent(auth, args, {
    agentId: GLOBAL_AGENTS_SID.DUST_ANT_MEDIUM,
    name: "dust-ant-medium",
    preferredModelConfiguration: CLAUDE_OPUS_4_6_DEFAULT_MODEL_CONFIG,
    preferredReasoningEffort: "medium",
  });
}

export function _getDustAntHighGlobalAgent(
  auth: Authenticator,
  args: DustLikeGlobalAgentArgs
): AgentConfigurationType | null {
  return _getDustLikeGlobalAgent(auth, args, {
    agentId: GLOBAL_AGENTS_SID.DUST_ANT_HIGH,
    name: "dust-ant-high",
    preferredModelConfiguration: CLAUDE_OPUS_4_6_DEFAULT_MODEL_CONFIG,
    preferredReasoningEffort: "high",
  });
}

export function _getDustKimiGlobalAgent(
  auth: Authenticator,
  args: DustLikeGlobalAgentArgs
): AgentConfigurationType | null {
  return _getDustLikeGlobalAgent(auth, args, {
    agentId: GLOBAL_AGENTS_SID.DUST_KIMI,
    name: "dust-kimi",
    preferredModelConfiguration: FIREWORKS_KIMI_K2P5_MODEL_CONFIG,
    preferredReasoningEffort: "light",
  });
}

export function _getDustKimiMediumGlobalAgent(
  auth: Authenticator,
  args: DustLikeGlobalAgentArgs
): AgentConfigurationType | null {
  return _getDustLikeGlobalAgent(auth, args, {
    agentId: GLOBAL_AGENTS_SID.DUST_KIMI_MEDIUM,
    name: "dust-kimi-medium",
    preferredModelConfiguration: FIREWORKS_KIMI_K2P5_MODEL_CONFIG,
    preferredReasoningEffort: "medium",
  });
}

export function _getDustKimiHighGlobalAgent(
  auth: Authenticator,
  args: DustLikeGlobalAgentArgs
): AgentConfigurationType | null {
  return _getDustLikeGlobalAgent(auth, args, {
    agentId: GLOBAL_AGENTS_SID.DUST_KIMI_HIGH,
    name: "dust-kimi-high",
    preferredModelConfiguration: FIREWORKS_KIMI_K2P5_MODEL_CONFIG,
    preferredReasoningEffort: "high",
  });
}

export function _getDustGlmGlobalAgent(
  auth: Authenticator,
  args: DustLikeGlobalAgentArgs
): AgentConfigurationType | null {
  return _getDustLikeGlobalAgent(auth, args, {
    agentId: GLOBAL_AGENTS_SID.DUST_GLM,
    name: "dust-glm",
    preferredModelConfiguration: FIREWORKS_GLM_5_MODEL_CONFIG,
    preferredReasoningEffort: "light",
  });
}

export function _getDustGlmMediumGlobalAgent(
  auth: Authenticator,
  args: DustLikeGlobalAgentArgs
): AgentConfigurationType | null {
  return _getDustLikeGlobalAgent(auth, args, {
    agentId: GLOBAL_AGENTS_SID.DUST_GLM_MEDIUM,
    name: "dust-glm-medium",
    preferredModelConfiguration: FIREWORKS_GLM_5_MODEL_CONFIG,
    preferredReasoningEffort: "medium",
  });
}

export function _getDustGlmHighGlobalAgent(
  auth: Authenticator,
  args: DustLikeGlobalAgentArgs
): AgentConfigurationType | null {
  return _getDustLikeGlobalAgent(auth, args, {
    agentId: GLOBAL_AGENTS_SID.DUST_GLM_HIGH,
    name: "dust-glm-high",
    preferredModelConfiguration: FIREWORKS_GLM_5_MODEL_CONFIG,
    preferredReasoningEffort: "high",
  });
}

export function _getDustMinimaxGlobalAgent(
  auth: Authenticator,
  args: DustLikeGlobalAgentArgs
): AgentConfigurationType | null {
  return _getDustLikeGlobalAgent(auth, args, {
    agentId: GLOBAL_AGENTS_SID.DUST_MINIMAX,
    name: "dust-minimax",
    preferredModelConfiguration: FIREWORKS_MINIMAX_M2P5_MODEL_CONFIG,
    preferredReasoningEffort: "light",
  });
}

export function _getDustMinimaxMediumGlobalAgent(
  auth: Authenticator,
  args: DustLikeGlobalAgentArgs
): AgentConfigurationType | null {
  return _getDustLikeGlobalAgent(auth, args, {
    agentId: GLOBAL_AGENTS_SID.DUST_MINIMAX_MEDIUM,
    name: "dust-minimax-medium",
    preferredModelConfiguration: FIREWORKS_MINIMAX_M2P5_MODEL_CONFIG,
    preferredReasoningEffort: "medium",
  });
}

export function _getDustMinimaxHighGlobalAgent(
  auth: Authenticator,
  args: DustLikeGlobalAgentArgs
): AgentConfigurationType | null {
  return _getDustLikeGlobalAgent(auth, args, {
    agentId: GLOBAL_AGENTS_SID.DUST_MINIMAX_HIGH,
    name: "dust-minimax-high",
    preferredModelConfiguration: FIREWORKS_MINIMAX_M2P5_MODEL_CONFIG,
    preferredReasoningEffort: "high",
  });
}

export function _getDustQuickGlobalAgent(
  auth: Authenticator,
  args: DustLikeGlobalAgentArgs
): AgentConfigurationType | null {
  return _getDustLikeGlobalAgent(auth, args, {
    agentId: GLOBAL_AGENTS_SID.DUST_QUICK,
    name: "dust-quick",
    preferredModelConfiguration: GEMINI_3_FLASH_MODEL_CONFIG,
    preferredReasoningEffort: "light",
  });
}

export function _getDustGoogGlobalAgent(
  auth: Authenticator,
  args: DustLikeGlobalAgentArgs
): AgentConfigurationType | null {
  return _getDustLikeGlobalAgent(auth, args, {
    agentId: GLOBAL_AGENTS_SID.DUST_GOOG,
    name: "dust-goog",
    preferredModelConfiguration: GEMINI_3_PRO_MODEL_CONFIG,
    preferredReasoningEffort: "light",
  });
}

export function _getDustGoogMediumGlobalAgent(
  auth: Authenticator,
  args: DustLikeGlobalAgentArgs
): AgentConfigurationType | null {
  return _getDustLikeGlobalAgent(auth, args, {
    agentId: GLOBAL_AGENTS_SID.DUST_GOOG_MEDIUM,
    name: "dust-goog-medium",
    preferredModelConfiguration: GEMINI_3_PRO_MODEL_CONFIG,
    preferredReasoningEffort: "medium",
  });
}

export function _getDustOaiGlobalAgent(
  auth: Authenticator,
  args: DustLikeGlobalAgentArgs
): AgentConfigurationType | null {
  return _getDustLikeGlobalAgent(auth, args, {
    agentId: GLOBAL_AGENTS_SID.DUST_OAI,
    name: "dust-oai",
    preferredModelConfiguration: GPT_5_2_MODEL_CONFIG,
    preferredReasoningEffort: "light",
  });
}

export function _getDustQuickMediumGlobalAgent(
  auth: Authenticator,
  args: DustLikeGlobalAgentArgs
): AgentConfigurationType | null {
  return _getDustLikeGlobalAgent(auth, args, {
    agentId: GLOBAL_AGENTS_SID.DUST_QUICK_MEDIUM,
    name: "dust-quick-medium",
    preferredModelConfiguration: GEMINI_3_FLASH_MODEL_CONFIG,
    preferredReasoningEffort: "medium",
  });
}

export function _getDustNextGlobalAgent(
  auth: Authenticator,
  args: DustLikeGlobalAgentArgs
): AgentConfigurationType | null {
  const customModel = CUSTOM_MODEL_CONFIGS[0];
  return _getDustLikeGlobalAgent(auth, args, {
    agentId: GLOBAL_AGENTS_SID.DUST_NEXT,
    name: "dust-next",
    preferredModelConfiguration:
      customModel ?? CLAUDE_OPUS_4_6_DEFAULT_MODEL_CONFIG,
    preferredReasoningEffort: "light",
  });
}

export function _getDustNextMediumGlobalAgent(
  auth: Authenticator,
  args: DustLikeGlobalAgentArgs
): AgentConfigurationType | null {
  const customModel = CUSTOM_MODEL_CONFIGS[0];
  return _getDustLikeGlobalAgent(auth, args, {
    agentId: GLOBAL_AGENTS_SID.DUST_NEXT_MEDIUM,
    name: "dust-next-medium",
    preferredModelConfiguration:
      customModel ?? CLAUDE_OPUS_4_6_DEFAULT_MODEL_CONFIG,
    preferredReasoningEffort: "medium",
  });
}

export function _getDustNextHighGlobalAgent(
  auth: Authenticator,
  args: DustLikeGlobalAgentArgs
): AgentConfigurationType | null {
  const customModel = CUSTOM_MODEL_CONFIGS[0];
  return _getDustLikeGlobalAgent(auth, args, {
    agentId: GLOBAL_AGENTS_SID.DUST_NEXT_HIGH,
    name: "dust-next-high",
    preferredModelConfiguration:
      customModel ?? CLAUDE_OPUS_4_6_DEFAULT_MODEL_CONFIG,
    preferredReasoningEffort: "high",
  });
}
