import { DustAPI } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  getMcpServerViewDescription,
  getMcpServerViewDisplayName,
} from "@app/lib/actions/mcp_helper";
import { getMCPServerRequirements } from "@app/lib/actions/mcp_internal_actions/input_configuration";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { isLightServerSideMCPToolConfiguration } from "@app/lib/actions/types/guards";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { AgentMessageFeedbackWithMetadataType } from "@app/lib/api/assistant/feedback";
import { getAgentFeedbacks } from "@app/lib/api/assistant/feedback";
import { fetchAgentOverview } from "@app/lib/api/assistant/observability/overview";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import apiConfig from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";
import {
  Err,
  getHeaderFromGroupIds,
  isModelProviderId,
  Ok,
  SUPPORTED_MODEL_CONFIGS,
} from "@app/types";

// Key used to store the agent configuration ID in additionalConfiguration.
const AGENT_CONFIGURATION_ID_KEY = "agentConfigurationId";

function getAgentConfigurationIdFromContext(
  agentLoopContext?: AgentLoopContextType
): string | null {
  if (
    agentLoopContext?.runContext &&
    isLightServerSideMCPToolConfiguration(
      agentLoopContext.runContext.toolConfiguration
    )
  ) {
    const value =
      agentLoopContext.runContext.toolConfiguration.additionalConfiguration[
        AGENT_CONFIGURATION_ID_KEY
      ];
    if (typeof value === "string") {
      return value;
    }
  }
  return null;
}

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("agent_copilot_context");

  // Tool: get_available_models
  server.tool(
    "get_available_models",
    "Get the list of available models. Can optionally filter by provider.",
    {
      providerId: z
        .string()
        .optional()
        .describe(
          "Optional provider ID to filter models (e.g., 'openai', 'anthropic', 'google_ai_studio', 'mistral')"
        ),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "get_available_models", agentLoopContext },
      async ({ providerId }) => {
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
        models = models.filter((m) =>
          whiteListedProviders.includes(m.providerId)
        );

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
      }
    )
  );

  // Tool: get_available_skills
  server.tool(
    "get_available_skills",
    "Get the list of available skills that can be added to agents. Returns skills accessible to the current user across all spaces they have access to.",
    {},
    withToolLogging(
      auth,
      { toolNameForMonitoring: "get_available_skills", agentLoopContext },
      async () => {
        const skills = await SkillResource.listByWorkspace(auth, {
          status: "active",
        });

        const skillList = skills.map((skill) => ({
          sId: skill.sId,
          name: skill.name,
          userFacingDescription: skill.userFacingDescription,
          agentFacingDescription: skill.agentFacingDescription,
          icon: skill.icon,
          isExtendable: skill.isExtendable,
          toolCount: skill.mcpServerViews.length,
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
      }
    )
  );

  // Tool: get_available_tools
  server.tool(
    "get_available_tools",
    "Get the list of available tools (MCP servers) that can be added to agents. Returns tools accessible to the current user.",
    {},
    withToolLogging(
      auth,
      { toolNameForMonitoring: "get_available_tools", agentLoopContext },
      async () => {
        const owner = auth.getNonNullableWorkspace();
        const requestedGroupIds = auth.groups().map((g) => g.sId);
        const prodCredentials = await prodAPICredentialsForOwner(owner, {
          useLocalInDev: true,
        });
        const config = apiConfig.getDustAPIConfig();
        const api = new DustAPI(
          config,
          {
            ...prodCredentials,
            extraHeaders: {
              ...getHeaderFromGroupIds(requestedGroupIds),
            },
          },
          logger,
          config.nodeEnv === "development" ? "http://localhost:3000" : null
        );

        const globalSpace = await SpaceResource.fetchWorkspaceGlobalSpace(auth);
        const r = await api.getMCPServerViews(globalSpace.sId, true);
        if (r.isErr()) {
          return new Err(
            new MCPError(`Failed to fetch tools: ${r.error.message}`, {
              tracked: false,
            })
          );
        }

        // Filter tools that have no requirements and are not hidden in builder.
        const mcpServerViews = r.value
          .filter(
            (mcpServerView) =>
              getMCPServerRequirements(mcpServerView).noRequirement
          )
          .filter(
            (mcpServerView) =>
              mcpServerView.server.availability !== "auto_hidden_builder"
          );

        const toolList = mcpServerViews.map((mcpServerView) => ({
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
      }
    )
  );

  // Tool: get_agent_feedback
  server.tool(
    "get_agent_feedback",
    "Get user feedback for the agent. This tool is agent-specific and requires the agent ID to be configured.",
    {
      agentVersion: z
        .number()
        .optional()
        .describe("Optional filter by specific agent version"),
      thumbDirection: z
        .enum(["up", "down"])
        .optional()
        .describe("Optional filter by feedback rating ('up' or 'down')"),
      daysOld: z
        .number()
        .optional()
        .describe(
          "Optional filter to only include feedback from the last N days"
        ),
      limit: z
        .number()
        .optional()
        .default(50)
        .describe("Maximum number of feedback items to return (default: 50)"),
      filter: z
        .enum(["active", "all"])
        .optional()
        .default("active")
        .describe(
          "Filter type: 'active' for non-dismissed feedback only (default), 'all' for all feedback"
        ),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "get_agent_feedback", agentLoopContext },
      async ({ agentVersion, thumbDirection, daysOld, limit, filter }) => {
        const agentConfigurationId =
          getAgentConfigurationIdFromContext(agentLoopContext);

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

        let feedbacks =
          feedbacksRes.value as AgentMessageFeedbackWithMetadataType[];

        // Apply additional filters.
        if (agentVersion !== undefined) {
          feedbacks = feedbacks.filter(
            (f) => f.agentConfigurationVersion === agentVersion
          );
        }

        if (thumbDirection) {
          feedbacks = feedbacks.filter(
            (f) => f.thumbDirection === thumbDirection
          );
        }

        if (daysOld !== undefined) {
          const cutoffDate = new Date();
          cutoffDate.setDate(cutoffDate.getDate() - daysOld);
          feedbacks = feedbacks.filter(
            (f) => new Date(f.createdAt) >= cutoffDate
          );
        }

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
          positive: feedbackList.filter((f) => f.thumbDirection === "up")
            .length,
          negative: feedbackList.filter((f) => f.thumbDirection === "down")
            .length,
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
      }
    )
  );

  // Tool: get_agent_insights
  server.tool(
    "get_agent_insights",
    "Get insight and analytics data for the agent. This tool is agent-specific and requires the agent ID to be configured.",
    {
      days: z
        .number()
        .optional()
        .default(30)
        .describe("Number of days to include in the analysis (default: 30)"),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "get_agent_insights", agentLoopContext },
      async ({ days }) => {
        const agentConfigurationId =
          getAgentConfigurationIdFromContext(agentLoopContext);

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
            new MCPError(
              `Agent configuration not found: ${agentConfigurationId}`,
              { tracked: false }
            )
          );
        }

        const daysValue = days ?? 30;
        const baseQuery = buildAgentAnalyticsBaseQuery({
          workspaceId: owner.sId,
          agentId: agentConfigurationId,
          days: daysValue,
        });

        const overviewResult = await fetchAgentOverview(baseQuery, daysValue);

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
            days: daysValue,
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
      }
    )
  );

  return server;
}

export default createServer;
