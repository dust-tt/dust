import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import { getAgentConfigurationIdFromContext } from "@app/lib/actions/mcp_internal_actions/servers/agent_copilot_context/helpers";
import {
  getAgentFeedbackMeta,
  getAgentInsightsMeta,
  getAvailableModelsMeta,
  getAvailableSkillsMeta,
  getAvailableToolsMeta,
} from "@app/lib/actions/mcp_internal_actions/servers/agent_copilot_context/metadata";
import type { ToolDefinition } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { defineTool } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { AgentMessageFeedbackWithMetadataType } from "@app/lib/api/assistant/feedback";
import { getAgentFeedbacks } from "@app/lib/api/assistant/feedback";
import { fetchAgentOverview } from "@app/lib/api/assistant/observability/overview";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import type { MCPServerViewType } from "@app/lib/api/mcp";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  Err,
  isModelProviderId,
  Ok,
  SUPPORTED_MODEL_CONFIGS,
} from "@app/types";

const getAvailableModelsTool = defineTool({
  ...getAvailableModelsMeta,
  handler: async ({ providerId }, extra) => {
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
});

const getAvailableSkillsTool = defineTool({
  ...getAvailableSkillsMeta,
  handler: async (_, extra) => {
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
});

const getAvailableToolsTool = defineTool({
  ...getAvailableToolsMeta,
  handler: async (_, extra) => {
    const auth = extra.auth;
    if (!auth) {
      return new Err(new MCPError("Authentication required"));
    }

    // Get all spaces the user has access to.
    const userSpaces = await SpaceResource.listWorkspaceSpacesAsMember(auth);

    // Fetch all MCP server views from those spaces.
    const mcpServerViews = await MCPServerViewResource.listBySpaces(
      auth,
      userSpaces
    );

    const flattenedServerViews = mcpServerViews
      .map((v) => v.toJSON())
      .filter((v): v is MCPServerViewType => v !== null)
      .filter(
        (v) =>
          v.server.availability === "manual" || v.server.availability === "auto"
      );

    const toolList = flattenedServerViews.map((mcpServerView) => ({
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
});

const getAgentFeedbackTool = defineTool({
  ...getAgentFeedbackMeta,
  handler: async ({ limit, filter }, extra) => {
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
});

const getAgentInsightsTool = defineTool({
  ...getAgentInsightsMeta,
  handler: async ({ days }, extra) => {
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
});

export const TOOLS = [
  getAvailableModelsTool,
  getAvailableSkillsTool,
  getAvailableToolsTool,
  getAgentFeedbackTool,
  getAgentInsightsTool,
] as ToolDefinition[];
