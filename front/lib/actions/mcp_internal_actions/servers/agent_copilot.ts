import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { fetchAgentOverview } from "@app/lib/api/assistant/observability/overview";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import { canUseModel } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { GlobalSkillsRegistry } from "@app/lib/resources/skill/global/registry";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { Err, Ok, SUPPORTED_MODEL_CONFIGS } from "@app/types";

async function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): Promise<McpServer> {
  const server = makeInternalMCPServer("agent_copilot");

  // Tool: get_agent_details
  // Returns key configuration data for an agent.
  server.tool(
    "get_agent_details",
    "Get key configuration data for an agent including name, description, instructions, model, and other settings. Optionally specify a version to get historical data.",
    {
      agent_id: z.string().describe("The agent configuration sId"),
      version: z
        .number()
        .optional()
        .describe(
          "Specific version number to retrieve. If not provided, returns the latest version."
        ),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "agent_copilot_get_agent_details",
        agentLoopContext,
      },
      async ({ agent_id, version }) => {
        const agentConfig = await getAgentConfiguration(auth, {
          agentId: agent_id,
          agentVersion: version,
          variant: "light",
        });

        if (!agentConfig) {
          return new Err(
            new MCPError(
              version !== undefined
                ? `Agent not found: ${agent_id} (version ${version})`
                : `Agent not found: ${agent_id}`
            )
          );
        }

        const result = {
          sId: agentConfig.sId,
          name: agentConfig.name,
          description: agentConfig.description,
          instructions: agentConfig.instructions,
          model: {
            providerId: agentConfig.model.providerId,
            modelId: agentConfig.model.modelId,
            temperature: agentConfig.model.temperature,
            reasoningEffort: agentConfig.model.reasoningEffort,
            responseFormat: agentConfig.model.responseFormat,
          },
          version: agentConfig.version,
          versionCreatedAt: agentConfig.versionCreatedAt,
          status: agentConfig.status,
          scope: agentConfig.scope,
          pictureUrl: agentConfig.pictureUrl,
          maxStepsPerRun: agentConfig.maxStepsPerRun,
          tags: agentConfig.tags.map((t) => ({ sId: t.sId, name: t.name })),
          templateId: agentConfig.templateId,
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
  // Lists skills available for agents, marking which are already used by the agent.
  server.tool(
    "get_available_skills",
    "List skills available for an agent. Returns all skills the user can add, with a flag indicating if each is already used by the agent.",
    {
      agent_id: z.string().describe("The agent configuration sId"),
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
      async ({ agent_id, include_global, status }) => {
        // Fetch the agent configuration to get existing skills.
        const agentConfig = await getAgentConfiguration(auth, {
          agentId: agent_id,
          variant: "light",
        });

        if (!agentConfig) {
          return new Err(new MCPError(`Agent not found: ${agent_id}`));
        }

        // Get skills already attached to this agent.
        const agentSkills = await SkillResource.listByAgentConfiguration(
          auth,
          agentConfig
        );
        const agentSkillIds = new Set(agentSkills.map((s) => s.sId));

        // Fetch all available custom skills.
        const customSkills = await SkillResource.listByWorkspace(auth, {
          status: status ?? "active",
          onlyCustom: true,
        });

        // Build custom skills response with isUsedByAgent flag.
        const customSkillsResult = customSkills.map((s) => ({
          sId: s.sId,
          name: s.name,
          userFacingDescription: s.userFacingDescription,
          agentFacingDescription: s.agentFacingDescription,
          icon: s.icon,
          status: s.status,
          isGlobal: false,
          isUsedByAgent: agentSkillIds.has(s.sId),
        }));

        // Fetch global skills if requested.
        let globalSkillsResult: Array<{
          sId: string;
          name: string;
          userFacingDescription: string;
          agentFacingDescription: string;
          icon: string;
          isGlobal: boolean;
          isAutoEnabled: boolean;
          isUsedByAgent: boolean;
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
            icon: def.icon,
            isGlobal: true,
            isAutoEnabled: def.isAutoEnabled ?? false,
            isUsedByAgent: agentSkillIds.has(def.sId),
          }));
        }

        return new Ok([
          {
            type: "text",
            text: JSON.stringify(
              {
                skills: [...customSkillsResult, ...globalSkillsResult],
                totalCount:
                  customSkillsResult.length + globalSkillsResult.length,
                agentId: agent_id,
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
  // Lists MCP server views available for agents across all user-accessible spaces.
  server.tool(
    "get_available_tools",
    "List tools (MCP server views) available for an agent across all spaces the user has access to. Returns all tools with a flag indicating if each is already used by the agent.",
    {
      agent_id: z.string().describe("The agent configuration sId"),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "agent_copilot_get_available_tools",
        agentLoopContext,
      },
      async ({ agent_id }) => {
        // Fetch the agent configuration to get existing tools (actions).
        const agentConfig = await getAgentConfiguration(auth, {
          agentId: agent_id,
          variant: "full",
        });

        if (!agentConfig) {
          return new Err(new MCPError(`Agent not found: ${agent_id}`));
        }

        // Get all spaces the user has access to.
        const userSpaces =
          await SpaceResource.listWorkspaceSpacesAsMember(auth);

        // Fetch all MCP server views from those spaces.
        const mcpServerViews = await MCPServerViewResource.listBySpaces(
          auth,
          userSpaces
        );

        // Build set of MCP server view sIds already used by the agent.
        // The agent's actions have mcpServerViewId, match against view.sId.
        // But we compare by server.sId to catch the same server in different spaces.
        const viewToServerSId = new Map<string, string>();
        for (const view of mcpServerViews) {
          const json = view.toJSON();
          viewToServerSId.set(view.sId, json.server.sId);
        }

        const agentServerSIds = new Set<string>();
        for (const action of agentConfig.actions) {
          if ("mcpServerViewId" in action && action.mcpServerViewId) {
            const serverSId = viewToServerSId.get(action.mcpServerViewId);
            if (serverSId) {
              agentServerSIds.add(serverSId);
            }
          }
        }

        // Build tools response with isUsedByAgent flag.
        const tools = mcpServerViews.map((view) => {
          const json = view.toJSON();
          return {
            sId: json.sId,
            name: json.server.name,
            description: json.server.description ?? "",
            icon: json.server.icon,
            serverType: json.serverType,
            availability: json.server.availability,
            spaceId: json.spaceId,
            isUsedByAgent: agentServerSIds.has(json.server.sId),
          };
        });

        return new Ok([
          {
            type: "text",
            text: JSON.stringify(
              {
                tools,
                count: tools.length,
                agentId: agent_id,
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
        const feedbacks =
          await AgentMessageFeedbackResource.getAgentConfigurationFeedbacksByDescVersion(
            {
              workspace,
              agentConfigurationId: agent_id,
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
