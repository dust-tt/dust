import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { fetchAgentOverview } from "@app/lib/api/assistant/observability/overview";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import { canUseModel } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { InternalMCPServerInMemoryResource } from "@app/lib/resources/internal_mcp_server_in_memory_resource";
import { GlobalSkillsRegistry } from "@app/lib/resources/skill/global/registry";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { LightAgentConfigurationType } from "@app/types";
import { Err, Ok, SUPPORTED_MODEL_CONFIGS } from "@app/types";

async function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): Promise<McpServer> {
  const server = makeInternalMCPServer("agent_copilot");

  // Tool: get_available_models
  // Lists LLM models available for the workspace, optionally filtered by provider.
  server.tool(
    "get_available_models",
    "List available LLM models that can be used for agents, optionally filtered by provider.",
    {
      provider: z
        .string()
        .optional()
        .describe(
          "Filter by provider ID (e.g., 'openai', 'anthropic', 'google_ai_studio', 'mistral')"
        ),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "agent_copilot_get_available_models",
        agentLoopContext,
      },
      async ({ provider }) => {
        const owner = auth.workspace();
        if (!owner) {
          return new Err(new MCPError("Workspace not found"));
        }

        const featureFlags = await getFeatureFlags(owner);
        const plan = auth.plan();

        const availableModels = SUPPORTED_MODEL_CONFIGS.filter((model) => {
          if (provider && model.providerId !== provider) {
            return false;
          }
          return canUseModel(model, featureFlags, plan, owner);
        });

        const result = availableModels.map((m) => ({
          modelId: m.modelId,
          providerId: m.providerId,
          displayName: m.displayName,
          contextSize: m.contextSize,
          largeModel: m.largeModel,
          supportsVision: m.supportsVision,
          defaultReasoningEffort: m.defaultReasoningEffort,
          isLegacy: m.isLegacy,
          description: m.description,
        }));

        return new Ok([
          {
            type: "text",
            text: JSON.stringify(
              { models: result, count: result.length },
              null,
              2
            ),
          },
        ]);
      }
    )
  );

  // Tool: get_available_skills
  // Lists skills available for agents (both custom and global).
  server.tool(
    "get_available_skills",
    "List skills that can be added to agents. Skills provide specialized capabilities and instructions.",
    {
      include_global: z
        .boolean()
        .optional()
        .default(true)
        .describe("Include global (built-in) skills"),
      status: z
        .enum(["active", "archived"])
        .optional()
        .default("active")
        .describe("Filter by skill status"),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "agent_copilot_get_available_skills",
        agentLoopContext,
      },
      async ({ include_global, status }) => {
        // Fetch custom skills from the database.
        const customSkills = await SkillResource.listByWorkspace(auth, {
          status: status ?? "active",
          onlyCustom: true,
        });

        // Build custom skills response.
        const customSkillsResult = customSkills.map((s) => ({
          sId: s.sId,
          name: s.name,
          userFacingDescription: s.userFacingDescription,
          agentFacingDescription: s.agentFacingDescription,
          status: s.status,
          isGlobal: false,
        }));

        // Fetch global skills if requested.
        let globalSkillsResult: Array<{
          sId: string;
          name: string;
          userFacingDescription: string;
          agentFacingDescription: string;
          isGlobal: boolean;
          isAutoEnabled: boolean;
        }> = [];

        if (include_global !== false) {
          const globalDefs = GlobalSkillsRegistry.findAll({
            status: status ?? "active",
          });
          globalSkillsResult = globalDefs.map((def) => ({
            sId: def.sId,
            name: def.name,
            userFacingDescription: def.userFacingDescription,
            agentFacingDescription: def.agentFacingDescription,
            isGlobal: true,
            isAutoEnabled: def.isAutoEnabled ?? false,
          }));
        }

        return new Ok([
          {
            type: "text",
            text: JSON.stringify(
              {
                customSkills: customSkillsResult,
                globalSkills: globalSkillsResult,
                totalCount:
                  customSkillsResult.length + globalSkillsResult.length,
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
  // Lists MCP servers/tools available for agents.
  server.tool(
    "get_available_tools",
    "List tools (MCP servers) that can be added to agents.",
    {
      include_internal: z
        .boolean()
        .optional()
        .default(true)
        .describe("Include internal (built-in) tools"),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "agent_copilot_get_available_tools",
        agentLoopContext,
      },
      async ({ include_internal }) => {
        const tools: Array<{
          sId: string;
          name: string;
          description: string;
          type: "internal";
          availability: string;
        }> = [];

        // Get internal MCP servers if requested.
        if (include_internal !== false) {
          const internalServers =
            await InternalMCPServerInMemoryResource.listAvailableInternalMCPServers(
              auth
            );
          for (const s of internalServers) {
            const json = s.toJSON();
            tools.push({
              sId: json.sId,
              name: json.name,
              description: json.description ?? "",
              type: "internal",
              availability: json.availability,
            });
          }
        }

        return new Ok([
          {
            type: "text",
            text: JSON.stringify({ tools, count: tools.length }, null, 2),
          },
        ]);
      }
    )
  );

  // Tool: get_agent_feedback
  // Gets user feedback for a specific agent with filtering options.
  server.tool(
    "get_agent_feedback",
    "Get user feedback for an agent with filters for version, time range, and rating.",
    {
      agent_id: z.string().describe("The agent configuration sId"),
      version: z
        .number()
        .optional()
        .describe("Filter by specific agent version"),
      days: z
        .number()
        .optional()
        .default(30)
        .describe("Number of days to look back (default: 30)"),
      rating: z
        .enum(["up", "down", "all"])
        .optional()
        .default("all")
        .describe("Filter by rating direction"),
      include_dismissed: z
        .boolean()
        .optional()
        .default(false)
        .describe("Include dismissed feedback"),
      limit: z
        .number()
        .optional()
        .default(20)
        .describe("Maximum number of feedback items to return"),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "agent_copilot_get_agent_feedback",
        agentLoopContext,
      },
      async ({ agent_id, version, days, rating, include_dismissed, limit }) => {
        const workspace = auth.getNonNullableWorkspace();

        // Get feedback items.
        // The method only uses agentConfiguration.sId, so this cast is safe.
        const feedbacks =
          await AgentMessageFeedbackResource.getAgentConfigurationFeedbacksByDescVersion(
            {
              workspace,
              agentConfiguration: {
                sId: agent_id,
              } as LightAgentConfigurationType,
              paginationParams: {
                limit: limit ?? 20,
                orderColumn: "createdAt",
                orderDirection: "desc",
              },
              filter: include_dismissed ? "all" : "active",
            }
          );

        // Apply additional filters.
        let filtered = feedbacks;
        if (version !== undefined) {
          filtered = filtered.filter(
            (f) => f.agentConfigurationVersion === version
          );
        }
        if (rating && rating !== "all") {
          filtered = filtered.filter((f) => f.thumbDirection === rating);
        }

        // Get summary counts.
        const counts =
          await AgentMessageFeedbackResource.getFeedbackCountForAssistants(
            auth,
            [agent_id],
            days ?? 30
          );

        const positiveCount =
          counts.find((c) => c.thumbDirection === "up")?.count ?? 0;
        const negativeCount =
          counts.find((c) => c.thumbDirection === "down")?.count ?? 0;

        const result = {
          feedback: filtered.map((f) => f.toJSON()),
          summary: {
            total: positiveCount + negativeCount,
            positive: positiveCount,
            negative: negativeCount,
          },
          filters: {
            agent_id,
            version: version ?? "all",
            days: days ?? 30,
            rating: rating ?? "all",
          },
        };

        return new Ok([
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ]);
      }
    )
  );

  // Tool: get_agent_insights
  // Gets analytics/observability data for an agent.
  server.tool(
    "get_agent_insights",
    "Get analytics and observability data for an agent including usage metrics and feedback summary.",
    {
      agent_id: z.string().describe("The agent configuration sId"),
      days: z
        .number()
        .optional()
        .default(30)
        .describe("Number of days to analyze (default: 30)"),
      version: z.string().optional().describe("Filter by specific version"),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "agent_copilot_get_agent_insights",
        agentLoopContext,
      },
      async ({ agent_id, days, version }) => {
        const workspace = auth.getNonNullableWorkspace();
        const daysValue = days ?? 30;

        // Build base query for Elasticsearch.
        const baseQuery = buildAgentAnalyticsBaseQuery({
          workspaceId: workspace.sId,
          agentId: agent_id,
          days: daysValue,
          version,
        });

        // Fetch overview metrics.
        const overviewResult = await fetchAgentOverview(baseQuery, daysValue);

        const result = {
          overview: overviewResult.isOk() ? overviewResult.value : null,
          error: overviewResult.isErr() ? overviewResult.error.message : null,
          period: {
            days: daysValue,
            version: version ?? "all",
          },
        };

        return new Ok([
          {
            type: "text",
            text: JSON.stringify(result, null, 2),
          },
        ]);
      }
    )
  );

  return server;
}

export default createServer;
