import { USED_MODEL_CONFIGS } from "@app/components/providers/types";
import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { AGENT_COPILOT_CONTEXT_TOOLS_METADATA } from "@app/lib/api/actions/servers/agent_copilot_context/metadata";
import { getAgentConfigurationIdFromContext } from "@app/lib/api/actions/servers/agent_copilot_helpers";
import { pruneConflictingInstructionSuggestions } from "@app/lib/api/assistant/agent_suggestion_pruning";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { getAgentConfigurationsForView } from "@app/lib/api/assistant/configuration/views";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import type { AgentMessageFeedbackWithMetadataType } from "@app/lib/api/assistant/feedback";
import { getAgentFeedbacks } from "@app/lib/api/assistant/feedback";
import { fetchAgentOverview } from "@app/lib/api/assistant/observability/overview";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { isModelAvailableAndWhitelisted } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { getDisplayNameForDataSource } from "@app/lib/data_sources";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { TemplateResource } from "@app/lib/resources/template_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type {
  AgentMessageType,
  DataSourceViewCategory,
  ModelConfigurationType,
  SpaceType,
  UserMessageType,
} from "@app/types";
import {
  Err,
  isAgentMention,
  isAgentMessageType,
  isModelProviderId,
  isUserMessageType,
  normalizeError,
  Ok,
  removeNulls,
} from "@app/types";
import { CUSTOM_MODEL_CONFIGS } from "@app/types/assistant/models/custom_models.generated";
import type { TemplateTagCodeType } from "@app/types/assistant/templates";
import type { JobType } from "@app/types/job_type";
import { isJobType } from "@app/types/job_type";
import type {
  AgentSuggestionState,
  SubAgentSuggestionType,
  ToolsSuggestionType,
} from "@app/types/suggestions/agent_suggestion";
import {
  INSTRUCTIONS_ROOT_TARGET_BLOCK_ID,
  isSkillsSuggestion,
  isSubAgentSuggestion,
  isToolsSuggestion,
} from "@app/types/suggestions/agent_suggestion";

// Knowledge categories relevant for agent builder (excluding apps, actions, triggers)
const KNOWLEDGE_CATEGORIES: DataSourceViewCategory[] = [
  "managed",
  "folder",
  "website",
];

const JOB_TYPE_TO_TEMPLATE_TAGS: Record<JobType, TemplateTagCodeType[]> = {
  engineering: ["ENGINEERING"],
  design: ["DESIGN", "UX_DESIGN", "UX_RESEARCH"],
  data: ["DATA"],
  finance: ["FINANCE"],
  legal: ["LEGAL"],
  marketing: ["MARKETING", "CONTENT", "WRITING"],
  operations: ["OPERATIONS"],
  product: ["PRODUCT", "PRODUCT_MANAGEMENT"],
  sales: ["SALES"],
  people: ["HIRING", "RECRUITING"],
  customer_success: ["SUPPORT"],
  customer_support: ["SUPPORT"],
  other: [],
};

// Limits for pending suggestions by kind
const MAX_PENDING_INSTRUCTIONS_SUGGESTIONS = 10;
const MAX_PENDING_TOOLS_SUGGESTIONS = 3;
const MAX_PENDING_SUB_AGENT_SUGGESTIONS = 2;
const MAX_PENDING_SKILLS_SUGGESTIONS = 2;

type LimitedSuggestionKind = "instructions" | "tools" | "sub_agent" | "skills";

interface KnowledgeDataSource {
  sId: string;
  name: string;
  connectorProvider: string | null;
}

interface KnowledgeCategoryData {
  category: DataSourceViewCategory;
  displayName: string;
  dataSources: KnowledgeDataSource[];
}

interface KnowledgeSpace {
  sId: string;
  name: string;
  kind: SpaceType["kind"];
  categories: KnowledgeCategoryData[];
}

function getMaxPendingSuggestions(kind: LimitedSuggestionKind): number {
  switch (kind) {
    case "instructions":
      return MAX_PENDING_INSTRUCTIONS_SUGGESTIONS;
    case "tools":
      return MAX_PENDING_TOOLS_SUGGESTIONS;
    case "sub_agent":
      return MAX_PENDING_SUB_AGENT_SUGGESTIONS;
    case "skills":
      return MAX_PENDING_SKILLS_SUGGESTIONS;
  }
}

/**
 * Get the list of available models for the workspace.
 * This filters USED_MODEL_CONFIGS and CUSTOM_MODEL_CONFIGS based on feature flags,
 * plan, and workspace provider whitelisting.
 */
async function getAvailableModelsForWorkspace(
  auth: Authenticator
): Promise<ModelConfigurationType[]> {
  const owner = auth.getNonNullableWorkspace();
  const plan = auth.plan();
  const featureFlags = await getFeatureFlags(owner);

  const allUsedModels = [...USED_MODEL_CONFIGS, ...CUSTOM_MODEL_CONFIGS];
  return allUsedModels.filter((m) =>
    isModelAvailableAndWhitelisted(m, featureFlags, plan, owner)
  );
}

function checkPendingSuggestionLimit(
  kind: LimitedSuggestionKind,
  newSuggestionCount: number,
  pendingSuggestionsCount: number
): { allowed: true } | { allowed: false; errorMessage: string } {
  const maxAllowed = getMaxPendingSuggestions(kind);

  const totalAfterAddition = pendingSuggestionsCount + newSuggestionCount;

  if (totalAfterAddition > maxAllowed) {
    const availableSlots = Math.max(0, maxAllowed - pendingSuggestionsCount);

    return {
      allowed: false,
      errorMessage:
        `Cannot add ${newSuggestionCount} new ${kind} suggestion(s): ` +
        `this would exceed the limit of ${maxAllowed} pending ${kind} suggestions. ` +
        `Currently ${pendingSuggestionsCount} pending, only ${availableSlots} slot(s) available. ` +
        `Please mark some existing suggestions as outdated using update_suggestions_state before adding new ones.`,
    };
  }

  return { allowed: true };
}

/**
 * Finds and marks as outdated any existing pending suggestions that match the predicate.
 * Returns the remaining pending suggestions after marking duplicates as outdated.
 */
async function markDuplicateSuggestionsAsOutdated(
  auth: Authenticator,
  pendingSuggestions: AgentSuggestionResource[],
  isDuplicate: (suggestion: AgentSuggestionResource) => boolean
): Promise<AgentSuggestionResource[]> {
  const duplicates: AgentSuggestionResource[] = [];
  const remaining: AgentSuggestionResource[] = [];

  for (const suggestion of pendingSuggestions) {
    if (isDuplicate(suggestion)) {
      duplicates.push(suggestion);
    } else {
      remaining.push(suggestion);
    }
  }

  if (duplicates.length > 0) {
    await AgentSuggestionResource.bulkUpdateState(auth, duplicates, "outdated");
  }

  return remaining;
}

interface AvailableTool {
  sId: string;
  name: string;
  description: string;
  serverType: MCPServerViewType["serverType"];
  availability: MCPServerViewType["server"]["availability"];
}

/**
 * Lists available tools (MCP server views) that can be added to agents.
 * Returns tools from all spaces the user is a member of, filtered to only
 * include tools with "manual" or "auto" availability.
 */
async function listAvailableTools(
  auth: Authenticator
): Promise<AvailableTool[]> {
  // Get all spaces the user is member of.
  const userSpaces = await SpaceResource.listWorkspaceSpacesAsMember(auth);

  // Fetch all MCP server views from those spaces.
  const mcpServerViews = await MCPServerViewResource.listBySpaces(
    auth,
    userSpaces
  );

  return mcpServerViews
    .map((v) => v.toJSON())
    .filter((v): v is MCPServerViewType => v !== null)
    .filter(
      (v) =>
        v.server.availability === "manual" || v.server.availability === "auto"
    )
    .map((mcpServerView) => ({
      sId: mcpServerView.sId,
      name: getMcpServerViewDisplayName(mcpServerView),
      description: getMcpServerViewDescription(mcpServerView),
      serverType: mcpServerView.serverType,
      availability: mcpServerView.server.availability,
    }));
}

interface AvailableSkill {
  sId: string;
  name: string;
  userFacingDescription: string | null;
  agentFacingDescription: string | null;
  icon: string | null;
  toolSIds: string[];
}

/**
 * Lists available skills that can be added to agents.
 * Returns active skills from the workspace that the user has access to.
 */
async function listAvailableSkills(
  auth: Authenticator
): Promise<AvailableSkill[]> {
  const skills = await SkillResource.listByWorkspace(auth, {
    status: "active",
  });

  return skills.map((skill) => ({
    sId: skill.sId,
    name: skill.name,
    userFacingDescription: skill.userFacingDescription,
    agentFacingDescription: skill.agentFacingDescription,
    icon: skill.icon,
    toolSIds: skill.mcpServerViews.map((v) => v.sId),
  }));
}

const handlers: ToolHandlers<typeof AGENT_COPILOT_CONTEXT_TOOLS_METADATA> = {
  get_available_knowledge: async ({ spaceId, category }, extra) => {
    const auth = extra.auth;
    if (!auth) {
      return new Err(new MCPError("Authentication required"));
    }

    // Get all spaces the user is a member of.
    let spaces = await SpaceResource.listWorkspaceSpacesAsMember(auth);

    // Filter to specific space if provided.
    if (spaceId) {
      spaces = spaces.filter((s) => s.sId === spaceId);
      if (spaces.length === 0) {
        return new Err(
          new MCPError(`Space not found or not accessible: ${spaceId}`, {
            tracked: false,
          })
        );
      }
    }

    // Determine which categories to fetch.
    const categoriesToFetch: DataSourceViewCategory[] = category
      ? [category]
      : KNOWLEDGE_CATEGORIES;

    // Fetch data source views for all spaces in parallel.
    const spaceResults = await concurrentExecutor(
      spaces,
      async (space) => {
        // Fetch data source views for this space.
        const dataSourceViews = await DataSourceViewResource.listBySpace(
          auth,
          space
        );

        // Filter and group by category.
        const categoriesData: KnowledgeCategoryData[] = [];

        for (const cat of categoriesToFetch) {
          const viewsForCategory = dataSourceViews
            .filter((dsv) => dsv.toJSON().category === cat)
            .map((dsv) => {
              const json = dsv.toJSON();
              return {
                sId: json.sId,
                name: getDisplayNameForDataSource(json.dataSource),
                connectorProvider: json.dataSource.connectorProvider,
              };
            });

          if (viewsForCategory.length > 0) {
            categoriesData.push({
              category: cat,
              displayName: getCategoryDisplayName(cat),
              dataSources: viewsForCategory,
            });
          }
        }

        // Only include spaces that have at least one category with data.
        if (categoriesData.length === 0) {
          return null;
        }

        return {
          sId: space.sId,
          name: space.name,
          kind: space.kind,
          categories: categoriesData,
        } satisfies KnowledgeSpace;
      },
      { concurrency: 8 }
    );

    // Filter out null results (spaces with no data sources).
    const knowledgeSpaces = removeNulls(spaceResults);

    // Calculate totals.
    let totalDataSources = 0;
    for (const space of knowledgeSpaces) {
      for (const cat of space.categories) {
        totalDataSources += cat.dataSources.length;
      }
    }

    return new Ok([
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            count: {
              spaces: knowledgeSpaces.length,
              dataSources: totalDataSources,
            },
            spaces: knowledgeSpaces,
          },
          null,
          2
        ),
      },
    ]);
  },

  get_available_models: async ({ providerId }, extra) => {
    const auth = extra.auth;
    if (!auth) {
      return new Err(new MCPError("Authentication required"));
    }

    let models = await getAvailableModelsForWorkspace(auth);

    if (providerId) {
      if (!isModelProviderId(providerId)) {
        return new Err(
          new MCPError(`Invalid provider ID: ${providerId}`, {
            tracked: false,
          })
        );
      }
      models = models.filter((m) => m.providerId === providerId);
    }

    const modelList = models.map((m) => ({
      providerId: m.providerId,
      modelId: m.modelId,
      displayName: m.displayName,
      description: m.description,
      contextSize: m.contextSize,
      supportsVision: m.supportsVision,
      isLatest: m.isLatest,
    }));

    return new Ok([
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            count: modelList.length,
            models: modelList,
          },
          null,
          2
        ),
      },
    ]);
  },

  get_available_skills: async (_, extra) => {
    const auth = extra.auth;
    if (!auth) {
      return new Err(new MCPError("Authentication required"));
    }

    const skillList = await listAvailableSkills(auth);

    return new Ok([
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            count: skillList.length,
            skills: skillList,
          },
          null,
          2
        ),
      },
    ]);
  },

  get_available_tools: async (_, extra) => {
    const auth = extra.auth;
    if (!auth) {
      return new Err(new MCPError("Authentication required"));
    }

    const toolList = await listAvailableTools(auth);

    return new Ok([
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            count: toolList.length,
            tools: toolList,
          },
          null,
          2
        ),
      },
    ]);
  },

  get_available_agents: async ({ limit }, extra) => {
    const auth = extra.auth;
    if (!auth) {
      return new Err(new MCPError("Authentication required"));
    }

    const agents = await getAgentConfigurationsForView({
      auth,
      agentsGetView: "list",
      variant: "light",
      limit: limit ?? 100,
    });

    const agentList = agents.map((agent) => ({
      sId: agent.sId,
      name: agent.name,
      description: agent.description,
      scope: agent.scope,
    }));

    return new Ok([
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            count: agentList.length,
            agents: agentList,
          },
          null,
          2
        ),
      },
    ]);
  },

  get_agent_feedback: async ({ limit, filter }, extra) => {
    const auth = extra.auth;
    if (!auth) {
      return new Err(new MCPError("Authentication required"));
    }

    const agentConfigurationId = getAgentConfigurationIdFromContext(
      extra.agentLoopContext
    );

    if (!agentConfigurationId) {
      return new Err(
        new MCPError(
          "Agent configuration ID not found in tool configuration. This tool requires the agentConfigurationId to be set in additionalConfiguration.",
          { tracked: false }
        )
      );
    }

    const feedbacksRes = await getAgentFeedbacks({
      auth,
      agentConfigurationId,
      withMetadata: true,
      paginationParams: {
        limit: limit ?? 50,
        orderColumn: "id",
        orderDirection: "desc",
      },
      filter: filter ?? "active",
    });

    if (feedbacksRes.isErr()) {
      return new Err(
        new MCPError(
          `Failed to fetch feedback: ${feedbacksRes.error.message}`,
          {
            tracked: false,
          }
        )
      );
    }

    const feedbacks = feedbacksRes.value.filter(
      (f): f is AgentMessageFeedbackWithMetadataType => true
    );

    const feedbackList = feedbacks.map((f) => ({
      sId: f.sId,
      thumbDirection: f.thumbDirection,
      content: f.content,
      createdAt: f.createdAt,
      agentConfigurationVersion: f.agentConfigurationVersion,
      userName: f.userName,
      isConversationShared: f.isConversationShared,
      conversationId: f.conversationId,
    }));

    const summary = {
      total: feedbackList.length,
      positive: feedbackList.filter((f) => f.thumbDirection === "up").length,
      negative: feedbackList.filter((f) => f.thumbDirection === "down").length,
    };

    return new Ok([
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            agentConfigurationId,
            summary,
            feedbacks: feedbackList,
          },
          null,
          2
        ),
      },
    ]);
  },

  get_agent_insights: async ({ days }, extra) => {
    const auth = extra.auth;
    if (!auth) {
      return new Err(new MCPError("Authentication required"));
    }

    const agentConfigurationId = getAgentConfigurationIdFromContext(
      extra.agentLoopContext
    );

    if (!agentConfigurationId) {
      return new Err(
        new MCPError(
          "Agent configuration ID not found in tool configuration. This tool requires the agentConfigurationId to be set in additionalConfiguration.",
          { tracked: false }
        )
      );
    }

    const owner = auth.getNonNullableWorkspace();

    // Verify agent configuration exists and is accessible.
    const agentConfiguration = await getAgentConfiguration(auth, {
      agentId: agentConfigurationId,
      variant: "light",
    });

    if (!agentConfiguration) {
      return new Err(
        new MCPError(`Agent configuration not found: ${agentConfigurationId}`, {
          tracked: false,
        })
      );
    }

    const numberOfDays = days ?? 30;
    const baseQuery = buildAgentAnalyticsBaseQuery({
      workspaceId: owner.sId,
      agentId: agentConfigurationId,
      days: numberOfDays,
    });

    const overviewResult = await fetchAgentOverview(baseQuery, numberOfDays);

    if (overviewResult.isErr()) {
      return new Err(
        new MCPError(
          `Failed to fetch agent insights: ${overviewResult.error.message}`,
          { tracked: false }
        )
      );
    }

    const overview = overviewResult.value;

    const insights = {
      agentConfigurationId,
      agentName: agentConfiguration.name,
      period: {
        days: numberOfDays,
      },
      overview: {
        activeUsers: overview.activeUsers,
        conversationCount: overview.conversationCount,
        messageCount: overview.messageCount,
        feedback: {
          positive: overview.positiveFeedbacks,
          negative: overview.negativeFeedbacks,
          total: overview.positiveFeedbacks + overview.negativeFeedbacks,
        },
      },
    };

    return new Ok([
      {
        type: "text" as const,
        text: JSON.stringify(insights, null, 2),
      },
    ]);
  },

  // Suggestion handlers
  suggest_prompt_edits: async (params, extra) => {
    const auth = extra.auth;
    if (!auth) {
      return new Err(new MCPError("Authentication required"));
    }

    const agentConfigurationId = getAgentConfigurationIdFromContext(
      extra.agentLoopContext
    );

    if (!agentConfigurationId) {
      return new Err(
        new MCPError(
          "Agent configuration ID not found in tool configuration. This tool requires the agentConfigurationId to be set in additionalConfiguration.",
          { tracked: false }
        )
      );
    }

    // Reject batches where multiple suggestions target the same block.
    const targetBlockIds = params.suggestions.map((s) => s.targetBlockId);
    const uniqueTargetBlockIds = new Set(targetBlockIds);
    if (uniqueTargetBlockIds.size !== targetBlockIds.length) {
      return new Err(
        new MCPError(
          "Multiple suggestions target the same block ID. Use a single suggestion per block." +
            `For full rewrites, target '${INSTRUCTIONS_ROOT_TARGET_BLOCK_ID}' instead.`,
          { tracked: false }
        )
      );
    }

    // Check pending suggestion limit before proceeding.
    const pendingInstructions =
      await AgentSuggestionResource.listByAgentConfigurationId(
        auth,
        agentConfigurationId,
        { states: ["pending"], kind: "instructions" }
      );

    const limitCheck = checkPendingSuggestionLimit(
      "instructions",
      params.suggestions.length,
      pendingInstructions.length
    );
    if (!limitCheck.allowed) {
      return new Err(new MCPError(limitCheck.errorMessage, { tracked: false }));
    }

    // Fetch the latest version of the agent configuration.
    const agentConfiguration = await getAgentConfiguration(auth, {
      agentId: agentConfigurationId,
      variant: "light",
    });

    if (!agentConfiguration) {
      return new Err(
        new MCPError(`Agent configuration not found: ${agentConfigurationId}`, {
          tracked: false,
        })
      );
    }

    const createdSuggestions: { sId: string; targetBlockId: string }[] = [];
    const directives: string[] = [];

    for (const suggestion of params.suggestions) {
      try {
        const { analysis, ...suggestionData } = suggestion;
        const created = await AgentSuggestionResource.createSuggestionForAgent(
          auth,
          agentConfiguration,
          {
            kind: "instructions",
            suggestion: suggestionData,
            analysis: analysis ?? null,
            state: "pending",
            source: "copilot",
          }
        );

        createdSuggestions.push({
          sId: created.sId,
          targetBlockId: suggestionData.targetBlockId,
        });
        directives.push(
          `:agent_suggestion[]{sId=${created.sId} kind=${created.kind}}`
        );
      } catch (error) {
        return new Err(
          new MCPError(
            `Failed to create suggestion: ${normalizeError(error).message}`,
            { tracked: false }
          )
        );
      }
    }

    await pruneConflictingInstructionSuggestions(
      auth,
      agentConfiguration,
      createdSuggestions
    );

    return new Ok([
      {
        type: "text" as const,
        text: directives.join("\n\n"),
      },
    ]);
  },

  suggest_tools: async (params, extra) => {
    const auth = extra.auth;
    if (!auth) {
      return new Err(new MCPError("Authentication required"));
    }

    const agentConfigurationId = getAgentConfigurationIdFromContext(
      extra.agentLoopContext
    );

    if (!agentConfigurationId) {
      return new Err(
        new MCPError(
          "Agent configuration ID not found in tool configuration. This tool requires the agentConfigurationId to be set in additionalConfiguration.",
          { tracked: false }
        )
      );
    }

    // Validate that the tool ID exists and is accessible.
    const { action, toolId } = params.suggestion;
    const tool = await MCPServerViewResource.fetchById(auth, toolId);

    if (!tool) {
      return new Err(
        new MCPError(
          `The tool ID "${toolId}" is invalid or not accessible. ` +
            `Use get_available_tools to see the list of available tools.`,
          { tracked: false }
        )
      );
    }

    // Fetch pending suggestions and mark duplicates (same toolId) as outdated.
    const pendingSuggestions =
      await AgentSuggestionResource.listByAgentConfigurationId(
        auth,
        agentConfigurationId,
        { states: ["pending"], kind: "tools" }
      );

    const remainingPending = await markDuplicateSuggestionsAsOutdated(
      auth,
      pendingSuggestions,
      (s) => isToolsSuggestion(s.suggestion) && s.suggestion.toolId === toolId
    );

    // Check pending suggestion limit after marking duplicates as outdated.
    const limitCheck = checkPendingSuggestionLimit(
      "tools",
      1,
      remainingPending.length
    );
    if (!limitCheck.allowed) {
      return new Err(new MCPError(limitCheck.errorMessage, { tracked: false }));
    }

    // Fetch the latest version of the agent configuration.
    const agentConfiguration = await getAgentConfiguration(auth, {
      agentId: agentConfigurationId,
      variant: "light",
    });

    if (!agentConfiguration) {
      return new Err(
        new MCPError(`Agent configuration not found: ${agentConfigurationId}`, {
          tracked: false,
        })
      );
    }

    const suggestion: ToolsSuggestionType = { action, toolId };

    try {
      const createdSuggestion =
        await AgentSuggestionResource.createSuggestionForAgent(
          auth,
          agentConfiguration,
          {
            kind: "tools",
            suggestion,
            analysis: params.analysis ?? null,
            state: "pending",
            source: "copilot",
          }
        );

      return new Ok([
        {
          type: "text" as const,
          text: `:agent_suggestion[]{sId=${createdSuggestion.sId} kind=${createdSuggestion.kind}}`,
        },
      ]);
    } catch (error) {
      return new Err(
        new MCPError(
          `Failed to create suggestion: ${normalizeError(error).message}`,
          { tracked: false }
        )
      );
    }
  },

  suggest_sub_agent: async (params, extra) => {
    const auth = extra.auth;
    if (!auth) {
      return new Err(new MCPError("Authentication required"));
    }

    const agentConfigurationId = getAgentConfigurationIdFromContext(
      extra.agentLoopContext
    );

    if (!agentConfigurationId) {
      return new Err(
        new MCPError(
          "Agent configuration ID not found in tool configuration. This tool requires the agentConfigurationId to be set in additionalConfiguration.",
          { tracked: false }
        )
      );
    }

    // Validate that the sub-agent exists and is accessible.
    const { action, subAgentId } = params;
    const subAgentConfiguration = await getAgentConfiguration(auth, {
      agentId: subAgentId,
      variant: "light",
    });

    if (!subAgentConfiguration) {
      return new Err(
        new MCPError(
          `The sub-agent ID "${subAgentId}" is invalid or not accessible.`,
          { tracked: false }
        )
      );
    }

    // Get the run_agent MCP server view.
    const runAgentServerView =
      await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
        auth,
        "run_agent"
      );

    if (!runAgentServerView) {
      return new Err(
        new MCPError(
          "The run_agent server is not available in this workspace.",
          { tracked: false }
        )
      );
    }

    // Fetch pending suggestions and mark duplicates (same childAgentId) as outdated.
    const pendingSuggestions =
      await AgentSuggestionResource.listByAgentConfigurationId(
        auth,
        agentConfigurationId,
        { states: ["pending"], kind: "sub_agent" }
      );

    const remainingPending = await markDuplicateSuggestionsAsOutdated(
      auth,
      pendingSuggestions,
      (s) =>
        isSubAgentSuggestion(s.suggestion) &&
        s.suggestion.childAgentId === subAgentId
    );

    // Check pending suggestion limit after marking duplicates as outdated.
    const limitCheck = checkPendingSuggestionLimit(
      "sub_agent",
      1,
      remainingPending.length
    );
    if (!limitCheck.allowed) {
      return new Err(new MCPError(limitCheck.errorMessage, { tracked: false }));
    }

    // Fetch the latest version of the agent configuration.
    const agentConfiguration = await getAgentConfiguration(auth, {
      agentId: agentConfigurationId,
      variant: "light",
    });

    if (!agentConfiguration) {
      return new Err(
        new MCPError(`Agent configuration not found: ${agentConfigurationId}`, {
          tracked: false,
        })
      );
    }

    // Create the sub_agent suggestion.
    const suggestion: SubAgentSuggestionType = {
      action,
      toolId: runAgentServerView.sId,
      childAgentId: subAgentId,
    };

    try {
      const createdSuggestion =
        await AgentSuggestionResource.createSuggestionForAgent(
          auth,
          agentConfiguration,
          {
            kind: "sub_agent",
            suggestion,
            analysis: params.analysis ?? null,
            state: "pending",
            source: "copilot",
          }
        );

      return new Ok([
        {
          type: "text" as const,
          text: `:agent_suggestion[]{sId=${createdSuggestion.sId} kind=${createdSuggestion.kind}}`,
        },
      ]);
    } catch (error) {
      return new Err(
        new MCPError(
          `Failed to create suggestion: ${normalizeError(error).message}`,
          { tracked: false }
        )
      );
    }
  },

  suggest_skills: async (params, extra) => {
    const auth = extra.auth;
    if (!auth) {
      return new Err(new MCPError("Authentication required"));
    }

    const agentConfigurationId = getAgentConfigurationIdFromContext(
      extra.agentLoopContext
    );

    if (!agentConfigurationId) {
      return new Err(
        new MCPError(
          "Agent configuration ID not found in tool configuration. This tool requires the agentConfigurationId to be set in additionalConfiguration.",
          { tracked: false }
        )
      );
    }

    // Validate that the skill ID exists and is accessible.
    const { action, skillId } = params.suggestion;
    const skill = await SkillResource.fetchById(auth, skillId);

    if (!skill) {
      return new Err(
        new MCPError(
          `The skill ID "${skillId}" is invalid or not accessible. ` +
            `Use get_available_skills to see the list of available skills.`,
          { tracked: false }
        )
      );
    }

    // Fetch pending suggestions and mark duplicates (same skillId) as outdated.
    const pendingSuggestions =
      await AgentSuggestionResource.listByAgentConfigurationId(
        auth,
        agentConfigurationId,
        { states: ["pending"], kind: "skills" }
      );

    const remainingPending = await markDuplicateSuggestionsAsOutdated(
      auth,
      pendingSuggestions,
      (s) =>
        isSkillsSuggestion(s.suggestion) && s.suggestion.skillId === skillId
    );

    // Check pending suggestion limit after marking duplicates as outdated.
    const limitCheck = checkPendingSuggestionLimit(
      "skills",
      1,
      remainingPending.length
    );
    if (!limitCheck.allowed) {
      return new Err(new MCPError(limitCheck.errorMessage, { tracked: false }));
    }

    // Fetch the latest version of the agent configuration.
    const agentConfiguration = await getAgentConfiguration(auth, {
      agentId: agentConfigurationId,
      variant: "light",
    });

    if (!agentConfiguration) {
      return new Err(
        new MCPError(`Agent configuration not found: ${agentConfigurationId}`, {
          tracked: false,
        })
      );
    }

    try {
      const suggestion = await AgentSuggestionResource.createSuggestionForAgent(
        auth,
        agentConfiguration,
        {
          kind: "skills",
          suggestion: { action, skillId },
          analysis: params.analysis ?? null,
          state: "pending",
          source: "copilot",
        }
      );

      return new Ok([
        {
          type: "text" as const,
          text: `:agent_suggestion[]{sId=${suggestion.sId} kind=${suggestion.kind}}`,
        },
      ]);
    } catch (error) {
      return new Err(
        new MCPError(
          `Failed to create suggestion: ${normalizeError(error).message}`,
          { tracked: false }
        )
      );
    }
  },

  suggest_model: async (params, extra) => {
    const auth = extra.auth;
    if (!auth) {
      return new Err(new MCPError("Authentication required"));
    }

    const availableModels = await getAvailableModelsForWorkspace(auth);
    const availableModelIds = availableModels.map((m) => m.modelId);

    const { modelId } = params.suggestion;
    if (!availableModelIds.includes(modelId)) {
      return new Err(
        new MCPError(
          `Invalid model ID: ${modelId}. Use get_available_models to see the list of available models.`,
          { tracked: false }
        )
      );
    }

    const agentConfigurationId = getAgentConfigurationIdFromContext(
      extra.agentLoopContext
    );

    if (!agentConfigurationId) {
      return new Err(
        new MCPError(
          "Agent configuration ID not found in tool configuration. This tool requires the agentConfigurationId to be set in additionalConfiguration.",
          { tracked: false }
        )
      );
    }

    // Fetch the latest version of the agent configuration.
    const agentConfiguration = await getAgentConfiguration(auth, {
      agentId: agentConfigurationId,
      variant: "light",
    });

    if (!agentConfiguration) {
      return new Err(
        new MCPError(`Agent configuration not found: ${agentConfigurationId}`, {
          tracked: false,
        })
      );
    }

    try {
      const suggestion = await AgentSuggestionResource.createSuggestionForAgent(
        auth,
        agentConfiguration,
        {
          kind: "model",
          suggestion: params.suggestion,
          analysis: params.analysis ?? null,
          state: "pending",
          source: "copilot",
        }
      );

      return new Ok([
        {
          type: "text" as const,
          text: `:agent_suggestion[]{sId=${suggestion.sId} kind=${suggestion.kind}}`,
        },
      ]);
    } catch (error) {
      return new Err(
        new MCPError(
          `Failed to create suggestion: ${normalizeError(error).message}`,
          { tracked: false }
        )
      );
    }
  },

  list_suggestions: async (params, extra) => {
    const auth = extra.auth;
    if (!auth) {
      return new Err(new MCPError("Authentication required"));
    }

    const agentConfigurationId = getAgentConfigurationIdFromContext(
      extra.agentLoopContext
    );

    if (!agentConfigurationId) {
      return new Err(
        new MCPError(
          "Agent configuration ID not found in tool configuration. This tool requires the agentConfigurationId to be set in additionalConfiguration.",
          { tracked: false }
        )
      );
    }

    // Lists suggestions across all versions of this agent.
    const suggestions =
      await AgentSuggestionResource.listByAgentConfigurationId(
        auth,
        agentConfigurationId,
        {
          states: params.states,
          kind: params.kind,
          limit: params.limit,
        }
      );

    const suggestionList = suggestions.map((s) => s.toJSON());

    return new Ok([
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            count: suggestionList.length,
            suggestions: suggestionList,
          },
          null,
          2
        ),
      },
    ]);
  },

  inspect_conversation: async (
    { conversationId, fromMessageIndex, toMessageIndex },
    extra
  ) => {
    const auth = extra.auth;
    if (!auth) {
      return new Err(new MCPError("Authentication required"));
    }

    const conversationRes = await getConversation(auth, conversationId);
    if (conversationRes.isErr()) {
      return new Err(
        new MCPError(
          `Conversation not found or not accessible: ${conversationId}`,
          {
            tracked: false,
          }
        )
      );
    }

    const conversation = conversationRes.value;

    // Flatten the 2D content array into a flat list of messages (last version of each).
    const flatMessages: (UserMessageType | AgentMessageType)[] = [];
    for (const messageVersions of conversation.content) {
      if (messageVersions.length === 0) {
        continue;
      }
      const lastVersion = messageVersions[messageVersions.length - 1];
      if (isUserMessageType(lastVersion) || isAgentMessageType(lastVersion)) {
        flatMessages.push(lastVersion);
      }
    }

    // Apply message index range.
    const from = fromMessageIndex ?? 0;
    const to = toMessageIndex ?? flatMessages.length;
    const isConversationTruncated = from > 0 || to < flatMessages.length;
    const slicedMessages = flatMessages.slice(from, to);

    // Build a map of agent message sId → list of agents it handed off to.
    // An agent message B with parentAgentMessageId === A.sId means A handed off to B.
    const handoffMap = new Map<string, { agentId: string }[]>();
    for (const msg of flatMessages) {
      if (isAgentMessageType(msg) && msg.parentAgentMessageId) {
        const targets = handoffMap.get(msg.parentAgentMessageId) ?? [];
        targets.push({ agentId: msg.configuration.sId });
        handoffMap.set(msg.parentAgentMessageId, targets);
      }
    }

    // Build the output messages, truncating content per message.
    const MAX_CONTENT_CHARS_PER_MESSAGE = 2_000;
    const MAX_TOTAL_CONTENT_CHARS = 20_000;

    function truncateContent(content: string | null): {
      content: string | null;
      contentTruncated: boolean;
    } {
      if (!content || content.length <= MAX_CONTENT_CHARS_PER_MESSAGE) {
        return { content, contentTruncated: false };
      }
      return {
        content: content.slice(0, MAX_CONTENT_CHARS_PER_MESSAGE),
        contentTruncated: true,
      };
    }

    let currentTotalChars = 0;
    const lines: string[] = [];

    lines.push(`# ${conversation.sId}: ${conversation.title ?? "Untitled"}`);
    if (isConversationTruncated) {
      lines.push(`_(conversation truncated)_`);
    }
    lines.push("");

    for (let i = 0; i < slicedMessages.length; i++) {
      if (currentTotalChars >= MAX_TOTAL_CONTENT_CHARS) {
        break;
      }

      const msg = slicedMessages[i];
      const index = from + i;

      if (isUserMessageType(msg)) {
        const { content, contentTruncated } = truncateContent(msg.content);
        currentTotalChars += content ? content.length : 0;

        lines.push(`## Message ${index}`);
        lines.push(`at ${msg.created}`);
        lines.push(`from user ${msg.sId}`);
        const mentions = msg.mentions.filter(isAgentMention);
        if (mentions.length > 0) {
          lines.push(
            `mentions: ${mentions.map((m) => m.configurationId).join(", ")}`
          );
        }
        lines.push("");
        lines.push(`### Content${contentTruncated ? " (truncated)" : ""}`);
        lines.push(content ?? "_empty_");
        lines.push("");
        continue;
      }

      // Agent message.
      const agentMsg = msg as AgentMessageType;
      const { content, contentTruncated } = truncateContent(agentMsg.content);
      currentTotalChars += content ? content.length : 0;

      const status = agentMsg.status === "succeeded" ? "succeeded" : "failed";

      lines.push(`## Message ${index}`);
      lines.push(`at ${agentMsg.created}`);
      lines.push(
        `from agent ${agentMsg.configuration.sId} (${agentMsg.configuration.name}) - ${status}`
      );
      lines.push("");

      // Actions.
      if (agentMsg.actions.length > 0) {
        lines.push("### Actions");
        for (const action of agentMsg.actions) {
          const actionStatus =
            action.status === "succeeded" ? "success" : "error";
          let actionLine = `- ${action.functionCallName} (${actionStatus})`;
          if (action.internalMCPServerName === "run_agent") {
            const childConvId = action.params.conversationId;
            if (typeof childConvId === "string") {
              actionLine += ` → child conversation: ${childConvId}`;
            }
          }
          lines.push(actionLine);
        }
        lines.push("");
      }

      // Handoffs.
      const handoffs = handoffMap.get(agentMsg.sId) ?? [];
      if (handoffs.length > 0) {
        lines.push(
          `Handed off to: ${handoffs.map((h) => h.agentId).join(", ")}`
        );
        lines.push("");
      }

      lines.push(`### Content${contentTruncated ? " (truncated)" : ""}`);
      lines.push(content ?? "_empty_");
      lines.push("");
    }

    return new Ok([
      {
        type: "text" as const,
        text: lines.join("\n"),
      },
    ]);
  },

  update_suggestions_state: async (params, extra) => {
    const auth = extra.auth;
    if (!auth) {
      return new Err(new MCPError("Authentication required"));
    }

    const { suggestions: suggestionUpdates } = params;

    const suggestionIds = suggestionUpdates.map((s) => s.suggestionId);
    const suggestions = await AgentSuggestionResource.fetchByIds(
      auth,
      suggestionIds
    );
    const suggestionsById = new Map(suggestions.map((s) => [s.sId, s]));

    const results: {
      success: boolean;
      suggestionId: string;
      error?: string;
    }[] = [];

    // Group suggestions by target state.
    const suggestionsByState = new Map<
      AgentSuggestionState,
      AgentSuggestionResource[]
    >();

    for (const { suggestionId, state } of suggestionUpdates) {
      const suggestion = suggestionsById.get(suggestionId);
      if (!suggestion) {
        results.push({
          success: false,
          suggestionId,
          error: `Suggestion not found: ${suggestionId}`,
        });
        continue;
      }

      const group = suggestionsByState.get(state) ?? [];
      group.push(suggestion);
      suggestionsByState.set(state, group);
    }

    // Bulk update each state group.
    for (const [state, group] of suggestionsByState) {
      try {
        await AgentSuggestionResource.bulkUpdateState(auth, group, state);
        results.push(
          ...group.map((s) => ({ success: true, suggestionId: s.sId }))
        );
      } catch (error) {
        const msg = normalizeError(error).message;
        results.push(
          ...group.map((s) => ({
            success: false,
            suggestionId: s.sId,
            error: `Failed to update suggestion state: ${msg}`,
          }))
        );
      }
    }

    return new Ok([
      {
        type: "text" as const,
        text: JSON.stringify({ results }, null, 2),
      },
    ]);
  },

  search_agent_templates: async ({ jobType }, extra) => {
    const auth = extra.auth;
    if (!auth) {
      return new Err(new MCPError("Authentication required"));
    }

    const allTemplates = await TemplateResource.listAll({
      visibility: "published",
    });

    const matchingTags =
      jobType && isJobType(jobType) ? JOB_TYPE_TO_TEMPLATE_TAGS[jobType] : [];

    const templates =
      matchingTags.length > 0
        ? allTemplates.filter((t) =>
            t.tags.some((tag) => matchingTags.includes(tag))
          )
        : allTemplates;

    const results = templates.map((t) => ({
      sId: t.sId,
      handle: t.handle,
      agentFacingDescription: t.agentFacingDescription,
      tags: t.tags,
    }));

    return new Ok([
      {
        type: "text" as const,
        text: JSON.stringify({ templates: results }, null, 2),
      },
    ]);
  },

  get_agent_template: async ({ templateId }, extra) => {
    const auth = extra.auth;
    if (!auth) {
      return new Err(new MCPError("Authentication required"));
    }

    const template = await TemplateResource.fetchByExternalId(templateId);

    if (!template) {
      return new Err(
        new MCPError(`Template not found: ${templateId}`, {
          tracked: false,
        })
      );
    }

    return new Ok([
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            sId: template.sId,
            handle: template.handle,
            userFacingDescription: template.userFacingDescription,
            agentFacingDescription: template.agentFacingDescription,
            copilotInstructions: template.copilotInstructions,
          },
          null,
          2
        ),
      },
    ]);
  },
};

function getCategoryDisplayName(category: DataSourceViewCategory): string {
  switch (category) {
    case "managed":
      return "Connected data";
    case "folder":
      return "Folders";
    case "website":
      return "Websites";
    default:
      return category;
  }
}

export const TOOLS = buildTools(AGENT_COPILOT_CONTEXT_TOOLS_METADATA, handlers);
