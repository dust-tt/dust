import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { AGENT_COPILOT_CONTEXT_TOOLS_METADATA } from "@app/lib/api/actions/servers/agent_copilot_context/metadata";
import { getAgentConfigurationIdFromContext } from "@app/lib/api/actions/servers/agent_copilot_helpers";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { AgentMessageFeedbackWithMetadataType } from "@app/lib/api/assistant/feedback";
import { getAgentFeedbacks } from "@app/lib/api/assistant/feedback";
import { fetchAgentOverview } from "@app/lib/api/assistant/observability/overview";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { getDisplayNameForDataSource } from "@app/lib/data_sources";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import type { DataSourceViewCategory, SpaceType } from "@app/types";
import {
  Err,
  isModelProviderId,
  normalizeError,
  Ok,
  SUPPORTED_MODEL_CONFIGS,
} from "@app/types";

// Knowledge categories relevant for agent builder (excluding apps, actions, triggers)
const KNOWLEDGE_CATEGORIES: DataSourceViewCategory[] = [
  "managed",
  "folder",
  "website",
];

// Type for a data source item in the knowledge hierarchy
interface KnowledgeDataSource {
  sId: string;
  name: string;
  connectorProvider: string | null;
}

// Type for a knowledge category in the hierarchy
interface KnowledgeCategoryData {
  category: DataSourceViewCategory;
  displayName: string;
  dataSources: KnowledgeDataSource[];
}

// Type for a space in the knowledge hierarchy
interface KnowledgeSpace {
  sId: string;
  name: string;
  kind: SpaceType["kind"];
  categories: KnowledgeCategoryData[];
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
        } as KnowledgeSpace;
      },
      { concurrency: 8 }
    );

    // Filter out null results (spaces with no data sources).
    const knowledgeSpaces = spaceResults.filter(
      (result): result is KnowledgeSpace => result !== null
    );

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

    const owner = auth.getNonNullableWorkspace();

    let models = SUPPORTED_MODEL_CONFIGS.filter((m) => !m.isLegacy);

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

    // Filter by whitelisted providers for the workspace.
    const whiteListedProviders =
      owner.whiteListedProviders ??
      SUPPORTED_MODEL_CONFIGS.map((m) => m.providerId);
    models = models.filter((m) => whiteListedProviders.includes(m.providerId));

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

    const skills = await SkillResource.listByWorkspace(auth, {
      status: "active",
    });

    const skillList = skills.map((skill) => ({
      sId: skill.sId,
      name: skill.name,
      userFacingDescription: skill.userFacingDescription,
      agentFacingDescription: skill.agentFacingDescription,
      icon: skill.icon,
      toolSIds: skill.mcpServerViews.map((v) => v.sId),
    }));

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

    // Get all spaces the user is member of.
    const userSpaces = await SpaceResource.listWorkspaceSpacesAsMember(auth);

    // Fetch all MCP server views from those spaces.
    // Similar to the logic in pages/api/w/[wId]/mcp/views/index.ts
    const mcpServerViews = await MCPServerViewResource.listBySpaces(
      auth,
      userSpaces
    );

    const serverViews = mcpServerViews
      .map((v) => v.toJSON())
      .filter((v): v is MCPServerViewType => v !== null)
      .filter(
        (v) =>
          v.server.availability === "manual" || v.server.availability === "auto"
      );

    const toolList = serverViews.map((mcpServerView) => ({
      sId: mcpServerView.sId,
      name: getMcpServerViewDisplayName(mcpServerView),
      description: getMcpServerViewDescription(mcpServerView),
      serverType: mcpServerView.serverType,
      availability: mcpServerView.server.availability,
    }));

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
  suggest_prompt_editions: async (params, extra) => {
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

    const createdSuggestions: { sId: string }[] = [];

    for (const suggestion of params.suggestions) {
      try {
        const created = await AgentSuggestionResource.createSuggestionForAgent(
          auth,
          agentConfiguration,
          {
            kind: "instructions",
            suggestion,
            analysis: params.analysis ?? null,
            state: "pending",
            source: "copilot",
          }
        );

        createdSuggestions.push({ sId: created.sId });
      } catch (error) {
        return new Err(
          new MCPError(
            `Failed to create suggestion: ${normalizeError(error).message}`,
            { tracked: false }
          )
        );
      }
    }

    return new Ok([
      {
        type: "text" as const,
        text: JSON.stringify(
          {
            success: true,
            suggestions: createdSuggestions,
          },
          null,
          2
        ),
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
          kind: "tools",
          suggestion: params.suggestion,
          analysis: params.analysis ?? null,
          state: "pending",
          source: "copilot",
        }
      );

      return new Ok([
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              success: true,
              sId: suggestion.sId,
            },
            null,
            2
          ),
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
          suggestion: params.suggestion,
          analysis: params.analysis ?? null,
          state: "pending",
          source: "copilot",
        }
      );

      return new Ok([
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              success: true,
              sId: suggestion.sId,
            },
            null,
            2
          ),
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
          text: JSON.stringify(
            {
              success: true,
              sId: suggestion.sId,
            },
            null,
            2
          ),
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
