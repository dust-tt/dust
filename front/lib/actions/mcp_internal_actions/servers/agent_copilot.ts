import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import type { LightMCPToolConfigurationType } from "@app/lib/actions/mcp";
import { MCPError } from "@app/lib/actions/mcp_errors";
import { TARGET_AGENT_ID } from "@app/lib/actions/mcp_internal_actions/constants";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { createAgentActionConfiguration } from "@app/lib/api/assistant/configuration/actions";
import {
  createAgentConfiguration,
  getAgentConfiguration,
  updateAgentRequirements,
} from "@app/lib/api/assistant/configuration/agent";
import { fetchAgentOverview } from "@app/lib/api/assistant/observability/overview";
import { buildAgentAnalyticsBaseQuery } from "@app/lib/api/assistant/observability/utils";
import { getAgentConfigurationRequirementsFromCapabilities } from "@app/lib/api/assistant/permissions";
import { canUseModel } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { AgentMCPServerConfigurationModel } from "@app/lib/models/agent/actions/mcp";
import { AgentSkillModel } from "@app/lib/models/agent/agent_skill";
import { AgentMessageFeedbackResource } from "@app/lib/resources/agent_message_feedback_resource";
import { GroupResource } from "@app/lib/resources/group_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { GlobalSkillsRegistry } from "@app/lib/resources/skill/global/registry";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  getResourceIdFromSId,
  isResourceSId,
} from "@app/lib/resources/string_ids";
import { TagResource } from "@app/lib/resources/tags_resource";
import { withTransaction } from "@app/lib/utils/sql_utils";
import type {
  AgentConfigurationScope,
  AgentModelConfigurationType,
  AgentStatus,
} from "@app/types";
import { Err, Ok, removeNulls, SUPPORTED_MODEL_CONFIGS } from "@app/types";

function isServerSideTool(
  toolConfig: LightMCPToolConfigurationType
): toolConfig is LightMCPToolConfigurationType & {
  additionalConfiguration: Record<string, unknown>;
} {
  return "mcpServerViewId" in toolConfig;
}

function getTargetAgentId(
  agentLoopContext: AgentLoopContextType | undefined
): string | null {
  if (agentLoopContext?.runContext) {
    const toolConfig = agentLoopContext.runContext.toolConfiguration;
    if (isServerSideTool(toolConfig)) {
      const targetAgentId = toolConfig.additionalConfiguration[TARGET_AGENT_ID];
      if (typeof targetAgentId === "string") {
        return targetAgentId;
      }
    }
  }
  return null;
}

async function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): Promise<McpServer> {
  const server = makeInternalMCPServer("agent_copilot");

  // Tool: get_agent_details
  // Returns key configuration data for an agent.
  server.tool(
    "get_agent_details",
    "Get key configuration data for the target agent including name, description, instructions, model, and other settings. Optionally specify a version to get historical data.",
    {
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
      async ({ version }) => {
        const agentId = getTargetAgentId(agentLoopContext);
        if (!agentId) {
          return new Err(
            new MCPError("No target agent ID configured for this copilot")
          );
        }

        const agentConfig = await getAgentConfiguration(auth, {
          agentId,
          agentVersion: version,
          variant: "light",
        });

        if (!agentConfig) {
          return new Err(
            new MCPError(
              version !== undefined
                ? `Agent not found: ${agentId} (version ${version})`
                : `Agent not found: ${agentId}`
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

  // Tool: update_agent
  // Updates agent configuration, skills, and tools in a single atomic operation.
  server.tool(
    "update_agent",
    "Update the target agent's configuration, skills, and/or tools in a single call. All parameters are optional - only provided fields will be updated.",
    {
      // Details fields (optional)
      name: z.string().optional().describe("New name for the agent"),
      description: z
        .string()
        .optional()
        .describe("New description for the agent"),
      instructions: z
        .string()
        .nullable()
        .optional()
        .describe("New instructions for the agent (can be null to clear)"),
      model: z
        .object({
          providerId: z.string().optional(),
          modelId: z.string().optional(),
          temperature: z.number().optional(),
          reasoningEffort: z
            .enum(["none", "light", "medium", "high"])
            .optional(),
        })
        .optional()
        .describe("Model configuration updates (partial updates supported)"),
      // Skills field (optional)
      skill_ids: z
        .array(z.string())
        .optional()
        .describe(
          "Complete list of skill sIds that the agent should have. Skills not in this list will be removed. If not provided, skills are not modified."
        ),
      // Tools field (optional)
      tool_ids: z
        .array(z.string())
        .optional()
        .describe(
          "Complete list of MCP server view sIds that the agent should have. Tools not in this list will be removed. If not provided, tools are not modified."
        ),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "agent_copilot_update_agent",
        agentLoopContext,
      },
      async ({ name, description, instructions, model, skill_ids, tool_ids }) => {
        const agentId = getTargetAgentId(agentLoopContext);
        if (!agentId) {
          return new Err(
            new MCPError("No target agent ID configured for this copilot")
          );
        }

        const workspace = auth.getNonNullableWorkspace();

        // Get the current agent configuration (full variant for actions).
        const initialAgentConfig = await getAgentConfiguration(auth, {
          agentId,
          variant: "full",
        });

        if (!initialAgentConfig) {
          return new Err(new MCPError(`Agent not found: ${agentId}`));
        }

        if (!initialAgentConfig.canEdit) {
          return new Err(
            new MCPError(`You do not have permission to edit this agent`)
          );
        }

        if (initialAgentConfig.scope === "global") {
          return new Err(new MCPError(`Cannot update global agents`));
        }

        const hasDetailsUpdate =
          name !== undefined ||
          description !== undefined ||
          instructions !== undefined ||
          model !== undefined;
        const hasSkillsUpdate = skill_ids !== undefined;
        const hasToolsUpdate = tool_ids !== undefined;

        // Track what was changed for the response.
        const changes: {
          details?: {
            name?: string;
            description?: string;
            instructions?: string | null;
            model?: object;
            newVersion?: number;
          };
          skills?: {
            added: string[];
            removed: string[];
            current: string[];
          };
          tools?: {
            added: string[];
            removed: string[];
            current: string[];
          };
        } = {};

        // Track the current agent version (may be updated after details change).
        let currentAgentVersion = initialAgentConfig.version;

        // === Step 1: Update agent details (if any) ===
        if (hasDetailsUpdate) {
          // Get editors for the agent.
          const editorGroupRes = await GroupResource.findEditorGroupForAgent(
            auth,
            initialAgentConfig
          );
          if (editorGroupRes.isErr()) {
            return new Err(
              new MCPError(
                `Failed to get editors: ${editorGroupRes.error.message}`
              )
            );
          }
          const members = await editorGroupRes.value.getActiveMembers(auth);
          const editors = members.map((m) => m.toJSON());

          // Get tags for the agent.
          const tags = await TagResource.listForAgent(
            auth,
            initialAgentConfig.id
          );

          // Compute requestedSpaceIds from the current agent's requestedSpaceIds.
          const requestedSpaceIds = removeNulls(
            initialAgentConfig.requestedSpaceIds.map((sId) =>
              getResourceIdFromSId(sId)
            )
          );

          // Merge model configuration.
          const mergedModel: AgentModelConfigurationType = {
            ...initialAgentConfig.model,
          };
          if (model?.providerId !== undefined) {
            const supportedProviders = SUPPORTED_MODEL_CONFIGS.map(
              (m) => m.providerId
            );
            if (
              !supportedProviders.includes(
                model.providerId as (typeof supportedProviders)[number]
              )
            ) {
              return new Err(
                new MCPError(`Invalid providerId: ${model.providerId}`)
              );
            }
            mergedModel.providerId =
              model.providerId as AgentModelConfigurationType["providerId"];
          }
          if (model?.modelId !== undefined) {
            const supportedModels = SUPPORTED_MODEL_CONFIGS.filter(
              (m) => m.providerId === mergedModel.providerId
            ).map((m) => m.modelId);
            if (
              !supportedModels.includes(
                model.modelId as (typeof supportedModels)[number]
              )
            ) {
              return new Err(
                new MCPError(
                  `Invalid modelId: ${model.modelId} for provider ${mergedModel.providerId}`
                )
              );
            }
            mergedModel.modelId =
              model.modelId as AgentModelConfigurationType["modelId"];
          }
          if (model?.temperature !== undefined) {
            mergedModel.temperature = model.temperature;
          }
          if (model?.reasoningEffort !== undefined) {
            mergedModel.reasoningEffort = model.reasoningEffort;
          }

          // Create the updated agent configuration.
          const result = await createAgentConfiguration(auth, {
            name: name ?? initialAgentConfig.name,
            description: description ?? initialAgentConfig.description,
            instructions:
              instructions !== undefined
                ? instructions
                : initialAgentConfig.instructions,
            pictureUrl: initialAgentConfig.pictureUrl,
            status: initialAgentConfig.status as AgentStatus,
            scope: initialAgentConfig.scope as Exclude<
              AgentConfigurationScope,
              "global"
            >,
            model: mergedModel,
            agentConfigurationId: agentId,
            templateId: initialAgentConfig.templateId,
            requestedSpaceIds,
            tags: tags.map((t) => t.toJSON()),
            editors,
          });

          if (result.isErr()) {
            return new Err(
              new MCPError(`Failed to update agent: ${result.error.message}`)
            );
          }

          // Track the new version.
          currentAgentVersion = result.value.version;

          changes.details = {
            ...(name !== undefined && { name }),
            ...(description !== undefined && { description }),
            ...(instructions !== undefined && { instructions }),
            ...(model !== undefined && { model: mergedModel }),
            newVersion: currentAgentVersion,
          };
        }

        // Re-fetch agent config with full variant if we need to process skills or tools.
        // This ensures we have the latest version after details update.
        let agentConfigForSkillsTools = initialAgentConfig;
        if (hasDetailsUpdate && (hasSkillsUpdate || hasToolsUpdate)) {
          const refetchedConfig = await getAgentConfiguration(auth, {
            agentId,
            variant: "full",
          });
          if (!refetchedConfig) {
            return new Err(
              new MCPError(`Agent not found after update: ${agentId}`)
            );
          }
          agentConfigForSkillsTools = refetchedConfig;
        }

        // === Step 2: Update skills (if any) ===
        let desiredSkills: SkillResource[] = [];
        if (hasSkillsUpdate && skill_ids) {
          // Get current skills attached to the agent.
          const currentSkills = await SkillResource.listByAgentConfiguration(
            auth,
            agentConfigForSkillsTools
          );
          const currentSkillIds = new Set(currentSkills.map((s) => s.sId));
          const desiredSkillIds = new Set(skill_ids);

          // Fetch all desired skills to validate they exist.
          desiredSkills = await SkillResource.fetchByIds(auth, skill_ids);
          const foundSkillIds = new Set(desiredSkills.map((s) => s.sId));
          const missingSkills = skill_ids.filter(
            (id) => !foundSkillIds.has(id)
          );
          if (missingSkills.length > 0) {
            return new Err(
              new MCPError(`Skills not found: ${missingSkills.join(", ")}`)
            );
          }

          // Compute skills to add and remove.
          const skillsToAdd = desiredSkills.filter(
            (s) => !currentSkillIds.has(s.sId)
          );
          const skillsToRemove = currentSkills.filter(
            (s) => !desiredSkillIds.has(s.sId)
          );

          await withTransaction(async (transaction) => {
            // Add new skills.
            for (const skill of skillsToAdd) {
              await skill.addToAgent(auth, agentConfigForSkillsTools);
            }

            // Remove skills.
            for (const skill of skillsToRemove) {
              const isCustomSkill = isResourceSId("skill", skill.sId);
              await AgentSkillModel.destroy({
                where: {
                  workspaceId: workspace.id,
                  agentConfigurationId: agentConfigForSkillsTools.id,
                  ...(isCustomSkill
                    ? { customSkillId: skill.id }
                    : { globalSkillId: skill.sId }),
                },
                transaction,
              });
            }
          });

          changes.skills = {
            added: skillsToAdd.map((s) => s.sId),
            removed: skillsToRemove.map((s) => s.sId),
            current: skill_ids,
          };
        }

        // === Step 3: Update tools (if any) ===
        if (hasToolsUpdate && tool_ids) {
          // Get user-accessible spaces to fetch MCP server views.
          const userSpaces =
            await SpaceResource.listWorkspaceSpacesAsMember(auth);
          const allMcpServerViews = await MCPServerViewResource.listBySpaces(
            auth,
            userSpaces
          );

          // Build map from sId to MCP server view.
          const mcpServerViewMap = new Map(
            allMcpServerViews.map((v) => [v.sId, v])
          );

          // Validate that all desired tool IDs exist and are accessible.
          const desiredViews: MCPServerViewResource[] = [];
          const missingTools: string[] = [];
          for (const toolId of tool_ids) {
            const view = mcpServerViewMap.get(toolId);
            if (view) {
              desiredViews.push(view);
            } else {
              missingTools.push(toolId);
            }
          }
          if (missingTools.length > 0) {
            return new Err(
              new MCPError(
                `Tools not found or not accessible: ${missingTools.join(", ")}`
              )
            );
          }

          // Get current tools from agent actions.
          const currentMcpServerViewIds = new Set<string>();
          for (const action of agentConfigForSkillsTools.actions) {
            if ("mcpServerViewId" in action && action.mcpServerViewId) {
              currentMcpServerViewIds.add(action.mcpServerViewId);
            }
          }

          const desiredMcpServerViewIds = new Set(tool_ids);

          // Compute tools to add and remove.
          const viewsToAdd = desiredViews.filter(
            (v) => !currentMcpServerViewIds.has(v.sId)
          );
          const viewIdsToRemove = [...currentMcpServerViewIds].filter(
            (id) => !desiredMcpServerViewIds.has(id)
          );

          await withTransaction(async (transaction) => {
            // Add new tools.
            for (const view of viewsToAdd) {
              const viewJson = view.toJSON();
              await createAgentActionConfiguration(
                auth,
                {
                  type: "mcp_server_configuration",
                  mcpServerViewId: view.sId,
                  name: viewJson.server.name,
                  description: viewJson.server.description ?? null,
                  additionalConfiguration: {},
                  timeFrame: null,
                  dataSources: null,
                  tables: null,
                  childAgentId: null,
                  jsonSchema: null,
                  dustAppConfiguration: null,
                  secretName: null,
                },
                agentConfigForSkillsTools
              );
            }

            // Remove tools.
            if (viewIdsToRemove.length > 0) {
              const viewModelIdsToRemove = removeNulls(
                viewIdsToRemove.map((sId) => {
                  const view = mcpServerViewMap.get(sId);
                  return view?.id;
                })
              );

              if (viewModelIdsToRemove.length > 0) {
                await AgentMCPServerConfigurationModel.destroy({
                  where: {
                    workspaceId: workspace.id,
                    agentConfigurationId: agentConfigForSkillsTools.id,
                    mcpServerViewId: viewModelIdsToRemove,
                  },
                  transaction,
                });
              }
            }
          });

          changes.tools = {
            added: viewsToAdd.map((v) => v.sId),
            removed: viewIdsToRemove,
            current: tool_ids,
          };
        }

        // === Step 4: Update agent requirements if skills or tools changed ===
        if (hasSkillsUpdate || hasToolsUpdate) {
          // Get current state for requirements calculation.
          const currentSkills = hasSkillsUpdate
            ? desiredSkills
            : await SkillResource.listByAgentConfiguration(
                auth,
                agentConfigForSkillsTools
              );

          // Build new actions list.
          const newActions = agentConfigForSkillsTools.actions.filter(
            (action) => {
              if ("mcpServerViewId" in action && action.mcpServerViewId) {
                if (hasToolsUpdate && tool_ids) {
                  return tool_ids.includes(action.mcpServerViewId);
                }
              }
              return true;
            }
          );

          const requirements =
            await getAgentConfigurationRequirementsFromCapabilities(auth, {
              actions: newActions,
              skills: currentSkills,
            });

          await updateAgentRequirements(
            auth,
            {
              agentModelId: agentConfigForSkillsTools.id,
              newSpaceIds: requirements.requestedSpaceIds,
            },
            {}
          );
        }

        return new Ok([
          {
            type: "text",
            text: JSON.stringify(
              {
                success: true,
                agentId,
                agentVersion: currentAgentVersion,
                changes,
              },
              null,
              2
            ),
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
    "List skills available for the target agent. Returns all skills the user can add, with a flag indicating if each is already used by the agent.",
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
        const agentId = getTargetAgentId(agentLoopContext);
        if (!agentId) {
          return new Err(
            new MCPError("No target agent ID configured for this copilot")
          );
        }

        // Fetch the agent configuration to get existing skills.
        const agentConfig = await getAgentConfiguration(auth, {
          agentId,
          variant: "light",
        });

        if (!agentConfig) {
          return new Err(new MCPError(`Agent not found: ${agentId}`));
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
                agentId,
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
    "List tools (MCP server views) available for the target agent across all spaces the user has access to. Returns all tools with a flag indicating if each is already used by the agent.",
    {},
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "agent_copilot_get_available_tools",
        agentLoopContext,
      },
      async () => {
        const agentId = getTargetAgentId(agentLoopContext);
        if (!agentId) {
          return new Err(
            new MCPError("No target agent ID configured for this copilot")
          );
        }

        // Fetch the agent configuration to get existing tools (actions).
        const agentConfig = await getAgentConfiguration(auth, {
          agentId,
          variant: "full",
        });

        if (!agentConfig) {
          return new Err(new MCPError(`Agent not found: ${agentId}`));
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
                agentId,
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
    "Get user feedback for the target agent with filters for version, time range, and rating.",
    {
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
      async ({ version, days, rating, include_dismissed, limit }) => {
        const agentId = getTargetAgentId(agentLoopContext);
        if (!agentId) {
          return new Err(
            new MCPError("No target agent ID configured for this copilot")
          );
        }

        const workspace = auth.getNonNullableWorkspace();

        // Get feedback items.
        const feedbacks =
          await AgentMessageFeedbackResource.getAgentConfigurationFeedbacksByDescVersion(
            {
              workspace,
              agentConfigurationId: agentId,
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
            [agentId],
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
            agentId,
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
    "Get analytics and observability data for the target agent including usage metrics and feedback summary.",
    {
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
      async ({ days, version }) => {
        const agentId = getTargetAgentId(agentLoopContext);
        if (!agentId) {
          return new Err(
            new MCPError("No target agent ID configured for this copilot")
          );
        }

        const workspace = auth.getNonNullableWorkspace();
        const daysValue = days ?? 30;

        // Build base query for Elasticsearch.
        const baseQuery = buildAgentAnalyticsBaseQuery({
          workspaceId: workspace.sId,
          agentId,
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
