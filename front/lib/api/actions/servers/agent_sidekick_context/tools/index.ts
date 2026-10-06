import type { ServerSideMCPServerConfigurationType } from "@app/lib/actions/mcp";
import { MCPError } from "@app/lib/actions/mcp_errors";
import { isToolWithKnowledge } from "@app/lib/actions/mcp_helper";
import type {
  ToolHandlerExtra,
  ToolHandlers,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type {
  InstructionsSuggestionSchema,
  SkillsSuggestionSchema,
  ToolsSuggestionSchema,
} from "@app/lib/api/actions/servers/agent_sidekick_context/metadata";
import { AGENT_SIDEKICK_CONTEXT_TOOLS_METADATA } from "@app/lib/api/actions/servers/agent_sidekick_context/metadata";
import { getAgentConfigurationIdFromContext } from "@app/lib/api/actions/servers/agent_sidekick_helpers";
import {
  getAgentFeedbackToolResult,
  getAgentInsightsToolResult,
} from "@app/lib/api/actions/servers/common/agent_feedback_and_insights/handlers";
import { RUN_AGENT_SERVER_NAME } from "@app/lib/api/actions/servers/run_agent/metadata";
import { createAgentInstructionSuggestions } from "@app/lib/api/assistant/agent_instructions_suggestions";
import { canAddPendingSuggestions } from "@app/lib/api/assistant/agent_suggestion_limits";
import { markDuplicateSuggestionsAsOutdated } from "@app/lib/api/assistant/agent_suggestion_pruning";
import { resolveAgentModelChange } from "@app/lib/api/assistant/configuration/model_update";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { renderConversationAsTextWithFeedback } from "@app/lib/api/assistant/conversation/render_conversation_with_feedback";
import {
  formatAvailableModels,
  formatAvailableSkills,
  formatAvailableTools,
  formatMcpDescription,
} from "@app/lib/api/assistant/global_agents/sidekick_context";
import { fetchSuggestableSkills } from "@app/lib/api/assistant/suggestable_skills";
import {
  checkSubAgentAddition,
  fetchRunAgentTool,
  fetchSuggestableSubAgents,
} from "@app/lib/api/assistant/suggestable_sub_agents";
import {
  checkToolAddition,
  fetchSuggestableTools,
} from "@app/lib/api/assistant/suggestable_tools";
import {
  describeMcpServer,
  listAvailableSkills,
  listAvailableTools,
  searchKnowledge,
} from "@app/lib/api/assistant/workspace_capabilities";
import type { Authenticator } from "@app/lib/auth";
import { getSelectableModelsForAuth } from "@app/lib/model_tiers/enabled_models";
import { formatSkillContext } from "@app/lib/reinforcement/format_skill_context";
import {
  DESCRIBE_MCP_TOOL_NAME,
  DESCRIBE_SKILL_TOOL_NAME,
} from "@app/lib/reinforcement/types";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import type { ConversationResource } from "@app/lib/resources/conversation_resource";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type {
  AgentMessageType,
  CompactionMessageType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import {
  isAgentMessageType,
  isCompactionMessageType,
  isUserMessageType,
} from "@app/types/assistant/conversation";
import { isAgentMention } from "@app/types/assistant/mentions";
import type { ContentFragmentType } from "@app/types/content_fragment";
import { isContentFragmentType } from "@app/types/content_fragment";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { isString } from "@app/types/shared/utils/general";
import type {
  AgentSuggestionState,
  KnowledgeSuggestionType,
  SubAgentSuggestionType,
  ToolsSuggestionType,
} from "@app/types/suggestions/agent_suggestion";
import {
  isKnowledgeSuggestion,
  isSkillsSuggestion,
  isSubAgentSuggestion,
  isToolsSuggestion,
} from "@app/types/suggestions/agent_suggestion";
import type { z } from "zod";

const UPDATE_SUGGESTIONS_STATE_RESOLUTION_HINT =
  "Please mark some existing suggestions as outdated using update_suggestions_state before " +
  "adding new ones.";

type InstructionSuggestionInput = z.infer<typeof InstructionsSuggestionSchema>;

/**
 * Shared logic for creating instruction suggestions. Used by both the
 * suggest_prompt_edits MCP handler and reinforced agent analysis.
 */
async function createInstructionSuggestions({
  auth,
  agentConfigurationId,
  suggestions,
  conversation,
}: {
  auth: Authenticator;
  agentConfigurationId: string;
  suggestions: InstructionSuggestionInput[];
  conversation?: ConversationResource;
}): Promise<
  Result<{ sId: string; kind: string; targetBlockId: string }[], string>
> {
  // Check pending suggestion limit before proceeding.
  const pendingInstructions =
    await AgentSuggestionResource.listByAgentConfigurationId(
      auth,
      agentConfigurationId,
      { states: ["pending"], kind: "instructions" }
    );

  const limitCheck = canAddPendingSuggestions({
    kind: "instructions",
    newPendingCount: suggestions.length,
    currentPendingCount: pendingInstructions.length,
    resolutionHint: UPDATE_SUGGESTIONS_STATE_RESOLUTION_HINT,
  });
  if (!limitCheck.allowed) {
    return new Err(limitCheck.errorMessage);
  }

  // Fetch the latest version of the agent configuration (full variant needed
  // for instructionsHtml used in conflict pruning).
  const agent = await AgentResource.fetchById(auth, agentConfigurationId);

  if (!agent || agent.scope === "global" || !agent.canViewContent) {
    return new Err(`Agent configuration not found: ${agentConfigurationId}`);
  }

  return createAgentInstructionSuggestions(auth, {
    agent,
    edits: suggestions,
    source: "sidekick",
    conversation: conversation ?? null,
  });
}

type ToolsSuggestionInput = z.infer<typeof ToolsSuggestionSchema> & {
  analysis?: string;
};

/**
 * Shared logic for creating tools suggestions. Used by both the
 * suggest_tools MCP handler and reinforced agent analysis.
 */
async function createToolsSuggestions({
  auth,
  agentConfigurationId,
  suggestions,
  conversation,
}: {
  auth: Authenticator;
  agentConfigurationId: string;
  suggestions: ToolsSuggestionInput[];
  conversation?: ConversationResource;
}): Promise<Result<{ sId: string; kind: string }[], string>> {
  // Reject batches where multiple suggestions target the same tool.
  const suggestionToolIds = suggestions.map((s) => s.toolId);
  const uniqueToolIds = new Set(suggestionToolIds);
  if (uniqueToolIds.size !== suggestionToolIds.length) {
    const duplicates = [
      ...new Set(
        suggestionToolIds.filter((id, i) => suggestionToolIds.indexOf(id) !== i)
      ),
    ];
    return new Err(
      `Multiple suggestions target the same tool ID: ${duplicates.join(", ")}. Use a single suggestion per tool.`
    );
  }

  // Validate that all tool IDs are ones the builder offers (see `suggestable-tools-match-list-tools`).
  const suggestable = await fetchSuggestableTools(auth, suggestionToolIds);
  const missingToolIds = suggestionToolIds.filter((id) => !suggestable.has(id));
  if (missingToolIds.length > 0) {
    return new Err(
      `The following tool ID(s) are invalid or not accessible: ${missingToolIds.join(", ")}. ` +
        `Check <workspace_context> for valid tool IDs.`
    );
  }
  const tools = [...suggestable.values()];

  // Reject knowledge tools — they should be suggested via suggest_knowledge.
  const knowledgeTools = tools.filter(isToolWithKnowledge);
  if (knowledgeTools.length > 0) {
    const knowledgeToolNames = knowledgeTools
      .map((t) => `${t.sId} (${t.server.name})`)
      .join(", ");
    return new Err(
      `The following ID(s) are knowledge tools, not regular tools: ${knowledgeToolNames}. ` +
        `Use \`suggest_knowledge\` instead of \`suggest_tools\` for data source, table, or data warehouse tools.`
    );
  }

  const runAgentTools = tools.filter(
    (t) => t.server.name === RUN_AGENT_SERVER_NAME
  );
  if (runAgentTools.length > 0) {
    const runAgentToolNames = runAgentTools.map((t) => t.sId).join(", ");
    return new Err(
      `The following ID(s) are run_agent tools: ${runAgentToolNames}. ` +
        `Use \`suggest_sub_agent\` instead of \`suggest_tools\` to add or remove a specific sub-agent.`
    );
  }

  for (const { action, toolId } of suggestions) {
    if (action !== "add") {
      continue;
    }
    const addition = checkToolAddition(toolId, suggestable);
    if (addition.isErr()) {
      return new Err(addition.error);
    }
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
    (s) =>
      isToolsSuggestion(s.suggestion) && uniqueToolIds.has(s.suggestion.toolId)
  );

  const limitCheck = canAddPendingSuggestions({
    kind: "tools",
    newPendingCount: suggestions.length,
    currentPendingCount: remainingPending.length,
    resolutionHint: UPDATE_SUGGESTIONS_STATE_RESOLUTION_HINT,
  });
  if (!limitCheck.allowed) {
    return new Err(limitCheck.errorMessage);
  }

  const agent = await AgentResource.fetchById(auth, agentConfigurationId);

  if (!agent) {
    return new Err(`Agent configuration not found: ${agentConfigurationId}`);
  }

  const createdSuggestions: { sId: string; kind: string }[] = [];

  for (const { action, toolId, analysis } of suggestions) {
    const suggestion: ToolsSuggestionType = { action, toolId };
    const created = await AgentSuggestionResource.createSuggestionForAgent(
      auth,
      agent,
      {
        kind: "tools",
        suggestion,
        analysis: analysis ?? null,
        state: "pending",
        source: "sidekick",
        conversationId: conversation?.id ?? null,
      }
    );

    createdSuggestions.push({ sId: created.sId, kind: created.kind });
  }

  return new Ok(createdSuggestions);
}

type SkillsSuggestionInput = z.infer<typeof SkillsSuggestionSchema> & {
  analysis?: string;
};

/**
 * Shared logic for creating skills suggestions. Used by both the
 * suggest_skills MCP handler and reinforced agent analysis.
 */
async function createSkillsSuggestions({
  auth,
  agentConfigurationId,
  suggestions,
  conversation,
}: {
  auth: Authenticator;
  agentConfigurationId: string;
  suggestions: SkillsSuggestionInput[];
  conversation?: ConversationResource;
}): Promise<Result<{ sId: string; kind: string }[], string>> {
  // Reject batches where multiple suggestions target the same skill.
  const suggestionSkillIds = suggestions.map((s) => s.skillId);
  const uniqueSkillIds = new Set(suggestionSkillIds);
  if (uniqueSkillIds.size !== suggestionSkillIds.length) {
    const duplicates = [
      ...new Set(
        suggestionSkillIds.filter(
          (id, i) => suggestionSkillIds.indexOf(id) !== i
        )
      ),
    ];
    return new Err(
      `Multiple suggestions target the same skill ID: ${duplicates.join(", ")}. Use a single suggestion per skill.`
    );
  }

  // Validate that all skill IDs exist and are accessible, and that added skills are ones the
  // builder offers (see `suggestable-skills-match-builder`).
  const addedSkillIds = suggestions
    .filter((s) => s.action === "add")
    .map((s) => s.skillId);
  const removedSkillIds = suggestions
    .filter((s) => s.action !== "add")
    .map((s) => s.skillId);
  const [suggestable, removedSkills] = await Promise.all([
    fetchSuggestableSkills(auth, addedSkillIds),
    SkillResource.fetchByIds(auth, removedSkillIds),
  ]);
  const foundSkillIds = new Set([
    ...suggestable.keys(),
    ...removedSkills.map((s) => s.sId),
  ]);
  const missingSkillIds = suggestionSkillIds.filter(
    (id) => !foundSkillIds.has(id)
  );
  if (missingSkillIds.length > 0) {
    return new Err(
      `The following skill ID(s) are invalid, archived or not accessible: ${missingSkillIds.join(", ")}. ` +
        `Check <workspace_context> for valid skill IDs.`
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
      isSkillsSuggestion(s.suggestion) &&
      uniqueSkillIds.has(s.suggestion.skillId)
  );

  // Conversational skill suggestions have no limit and cannot be resolved from the sidekick: only
  // the sidekick's own count (see `pending-suggestion-limit-enforced-by-caller`).
  const limitCheck = canAddPendingSuggestions({
    kind: "skills",
    newPendingCount: suggestions.length,
    currentPendingCount: remainingPending.filter((s) => s.source === "sidekick")
      .length,
    resolutionHint: UPDATE_SUGGESTIONS_STATE_RESOLUTION_HINT,
  });
  if (!limitCheck.allowed) {
    return new Err(limitCheck.errorMessage);
  }

  const agent = await AgentResource.fetchById(auth, agentConfigurationId);

  if (!agent) {
    return new Err(`Agent configuration not found: ${agentConfigurationId}`);
  }

  const createdSuggestions: { sId: string; kind: string }[] = [];

  for (const { action, skillId, analysis } of suggestions) {
    const created = await AgentSuggestionResource.createSuggestionForAgent(
      auth,
      agent,
      {
        kind: "skills",
        suggestion: { action, skillId },
        analysis: analysis ?? null,
        state: "pending",
        source: "sidekick",
        conversationId: conversation?.id ?? null,
      }
    );

    createdSuggestions.push({ sId: created.sId, kind: created.kind });
  }

  return new Ok(createdSuggestions);
}

// The agent under edit comes from the server configuration, never from the model.
function getTargetAgentConfigurationId(
  runContext: ToolHandlerExtra["runContext"]
): Result<string, MCPError> {
  const agentConfigurationId = getAgentConfigurationIdFromContext({
    runContext,
  });
  if (!agentConfigurationId) {
    return new Err(
      new MCPError(
        "Agent configuration ID not found in tool configuration. This tool requires the agentConfigurationId to be set in additionalConfiguration.",
        { tracked: false }
      )
    );
  }
  return new Ok(agentConfigurationId);
}

const handlers: ToolHandlers<typeof AGENT_SIDEKICK_CONTEXT_TOOLS_METADATA> = {
  get_available_models: async ({ providerId }, { auth }) => {
    const models = await getSelectableModelsForAuth(auth, { providerId });

    return new Ok([
      {
        type: "text" as const,
        text: formatAvailableModels(models),
      },
    ]);
  },

  get_available_skills: async (_, { auth }) => {
    const [skillList, toolList] = await Promise.all([
      listAvailableSkills(auth),
      listAvailableTools(auth),
    ]);

    return new Ok([
      {
        type: "text" as const,
        text: formatAvailableSkills(skillList, toolList),
      },
    ]);
  },

  get_available_tools: async (_, { auth }) => {
    const toolList = await listAvailableTools(auth);

    return new Ok([
      {
        type: "text" as const,
        text: formatAvailableTools(toolList),
      },
    ]);
  },

  [DESCRIBE_MCP_TOOL_NAME]: async ({ mcpId }, { auth }) => {
    const server = await describeMcpServer(auth, mcpId);
    if (!server) {
      return new Ok([
        { type: "text" as const, text: `MCP server not found: ${mcpId}` },
      ]);
    }
    return new Ok([
      { type: "text" as const, text: formatMcpDescription(mcpId, server) },
    ]);
  },

  [DESCRIBE_SKILL_TOOL_NAME]: async ({ skillId }, { auth }) => {
    const skill = await SkillResource.fetchById(auth, skillId);
    if (!skill) {
      return new Ok([
        { type: "text" as const, text: `Skill not found: ${skillId}` },
      ]);
    }
    return new Ok([
      {
        type: "text" as const,
        text: formatSkillContext(skill.toJSON(auth), "full"),
      },
    ]);
  },

  get_available_agents: async ({ limit, agentPrefix }, { auth }) => {
    const lowerCasePrefix = agentPrefix?.toLowerCase();
    const agents = (await AgentResource.listReadable(auth))
      .filter(
        (agent) =>
          !lowerCasePrefix ||
          agent.name.toLowerCase().startsWith(lowerCasePrefix)
      )
      .slice(0, limit ?? 100);

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

  inspect_available_agent: async ({ agentId }, { auth }) => {
    const agent = await AgentResource.fetchById(auth, agentId);

    if (!agent || !agent.canViewContent) {
      return new Err(
        new MCPError(`Agent not found or not accessible: ${agentId}`, {
          tracked: false,
        })
      );
    }

    const [{ instructions }, actions, skills] = await Promise.all([
      agent.fetchInstructions(),
      agent.listActions(auth),
      agent.listSkills(auth),
    ]);
    const toolIds = actions
      .filter(
        (action): action is ServerSideMCPServerConfigurationType =>
          "mcpServerViewId" in action
      )
      .map((action) => action.mcpServerViewId);
    const agentDetails = agent.toInspectionJSON({
      instructions,
      toolIds,
      skillIds: skills.map((skill) => skill.sId),
    });

    return new Ok([
      {
        type: "text" as const,
        text: JSON.stringify(agentDetails, null, 2),
      },
    ]);
  },

  get_agent_feedback: async (input, { auth, runContext }) => {
    const agentConfigurationIdRes = getTargetAgentConfigurationId(runContext);
    if (agentConfigurationIdRes.isErr()) {
      return agentConfigurationIdRes;
    }
    const agentConfigurationId = agentConfigurationIdRes.value;

    return getAgentFeedbackToolResult(auth, {
      ...input,
      agentConfigurationId,
    });
  },

  get_agent_insights: async (input, { auth, runContext }) => {
    const agentConfigurationIdRes = getTargetAgentConfigurationId(runContext);
    if (agentConfigurationIdRes.isErr()) {
      return agentConfigurationIdRes;
    }
    const agentConfigurationId = agentConfigurationIdRes.value;

    return getAgentInsightsToolResult(auth, {
      ...input,
      agentConfigurationId,
    });
  },

  // Suggestion handlers
  suggest_prompt_edits: async (params, { auth, runContext }) => {
    const agentConfigurationIdRes = getTargetAgentConfigurationId(runContext);
    if (agentConfigurationIdRes.isErr()) {
      return agentConfigurationIdRes;
    }
    const agentConfigurationId = agentConfigurationIdRes.value;

    try {
      const result = await createInstructionSuggestions({
        auth,
        agentConfigurationId,
        suggestions: params.suggestions,
      });

      if (result.isErr()) {
        return new Err(new MCPError(result.error, { tracked: false }));
      }

      const directives = result.value.map(
        (s) => `:agent_suggestion[]{sId=${s.sId} kind=${s.kind}}`
      );

      return new Ok([
        {
          type: "text" as const,
          text: directives.join("\n\n"),
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

  suggest_tools: async (params, { auth, runContext }) => {
    const agentConfigurationIdRes = getTargetAgentConfigurationId(runContext);
    if (agentConfigurationIdRes.isErr()) {
      return agentConfigurationIdRes;
    }
    const agentConfigurationId = agentConfigurationIdRes.value;

    try {
      const result = await createToolsSuggestions({
        auth,
        agentConfigurationId,
        suggestions: params.suggestions,
      });

      if (result.isErr()) {
        return new Err(new MCPError(result.error, { tracked: false }));
      }

      const directives = result.value.map(
        (s) => `:agent_suggestion[]{sId=${s.sId} kind=${s.kind}}`
      );

      return new Ok([
        {
          type: "text" as const,
          text: directives.join("\n\n"),
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

  suggest_sub_agent: async (params, { auth, runContext }) => {
    const agentConfigurationIdRes = getTargetAgentConfigurationId(runContext);
    if (agentConfigurationIdRes.isErr()) {
      return agentConfigurationIdRes;
    }
    const agentConfigurationId = agentConfigurationIdRes.value;

    // Validate that the sub-agent exists and is accessible, and that an added one is one the
    // builder offers (see `suggestable-sub-agents-match-builder`).
    const { action, subAgentId } = params;
    if (action === "add") {
      const suggestable = await fetchSuggestableSubAgents(auth, [subAgentId]);
      const addition = checkSubAgentAddition(subAgentId, suggestable, {
        agentId: agentConfigurationId,
      });
      if (addition.isErr()) {
        return new Err(new MCPError(addition.error, { tracked: false }));
      }
    } else {
      const subAgentConfiguration = await AgentResource.fetchById(
        auth,
        subAgentId
      );
      if (!subAgentConfiguration || !auth.can("read", subAgentConfiguration)) {
        return new Err(
          new MCPError(
            `The sub-agent ID "${subAgentId}" is invalid or not accessible.`,
            { tracked: false }
          )
        );
      }
    }

    const runAgentTool = await fetchRunAgentTool(auth);
    if (!runAgentTool) {
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
    const limitCheck = canAddPendingSuggestions({
      kind: "sub_agent",
      newPendingCount: 1,
      // Conversational sub-agent suggestions have no limit and cannot be resolved from the
      // sidekick: only the sidekick's own count.
      currentPendingCount: remainingPending.filter(
        (s) => s.source === "sidekick"
      ).length,
      resolutionHint: UPDATE_SUGGESTIONS_STATE_RESOLUTION_HINT,
    });
    if (!limitCheck.allowed) {
      return new Err(new MCPError(limitCheck.errorMessage, { tracked: false }));
    }

    // Fetch the latest version of the agent configuration.
    const agent = await AgentResource.fetchById(auth, agentConfigurationId);

    if (!agent) {
      return new Err(
        new MCPError(`Agent configuration not found: ${agentConfigurationId}`, {
          tracked: false,
        })
      );
    }

    // Create the sub_agent suggestion.
    const suggestion: SubAgentSuggestionType = {
      action,
      toolId: runAgentTool.sId,
      childAgentId: subAgentId,
    };

    try {
      const createdSuggestion =
        await AgentSuggestionResource.createSuggestionForAgent(auth, agent, {
          kind: "sub_agent",
          suggestion,
          analysis: params.analysis ?? null,
          state: "pending",
          source: "sidekick",
        });

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

  suggest_skills: async (params, { auth, runContext }) => {
    const agentConfigurationIdRes = getTargetAgentConfigurationId(runContext);
    if (agentConfigurationIdRes.isErr()) {
      return agentConfigurationIdRes;
    }
    const agentConfigurationId = agentConfigurationIdRes.value;

    try {
      const result = await createSkillsSuggestions({
        auth,
        agentConfigurationId,
        suggestions: params.suggestions,
      });

      if (result.isErr()) {
        return new Err(new MCPError(result.error, { tracked: false }));
      }

      const directives = result.value.map(
        (s) => `:agent_suggestion[]{sId=${s.sId} kind=${s.kind}}`
      );

      return new Ok([
        {
          type: "text" as const,
          text: directives.join("\n\n"),
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

  suggest_model: async (params, { auth, runContext }) => {
    const { modelId, reasoningEffort } = params.suggestion;
    const resolved = await resolveAgentModelChange(auth, {
      modelId,
      reasoningEffort,
    });
    if (resolved.isErr()) {
      return new Err(
        new MCPError(
          `${resolved.error.message} Check <workspace_context> for valid model IDs and reasoning efforts.`,
          { tracked: false }
        )
      );
    }

    const agentConfigurationIdRes = getTargetAgentConfigurationId(runContext);
    if (agentConfigurationIdRes.isErr()) {
      return agentConfigurationIdRes;
    }
    const agentConfigurationId = agentConfigurationIdRes.value;

    // Fetch the latest version of the agent configuration.
    const agent = await AgentResource.fetchById(auth, agentConfigurationId);

    if (!agent) {
      return new Err(
        new MCPError(`Agent configuration not found: ${agentConfigurationId}`, {
          tracked: false,
        })
      );
    }

    try {
      const suggestion = await AgentSuggestionResource.createSuggestionForAgent(
        auth,
        agent,
        {
          kind: "model",
          suggestion: params.suggestion,
          analysis: params.analysis ?? null,
          state: "pending",
          source: "sidekick",
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

  search_knowledge: async ({ query, topK, category }, { auth }) => {
    const res = await searchKnowledge(auth, { query, topK, category });
    if (res.isErr()) {
      return new Err(
        new MCPError(`Failed to search knowledge: ${res.error.message}`)
      );
    }

    const { dataSourceViews, nodes, totalDataSourceViews } = res.value;
    if (totalDataSourceViews === 0) {
      return new Ok([
        {
          type: "text" as const,
          text: JSON.stringify({
            dataSourceViews: [],
            nodes: [],
            message: "No knowledge sources found in the workspace.",
          }),
        },
      ]);
    }

    return new Ok([
      {
        type: "text" as const,
        text: JSON.stringify({ dataSourceViews, nodes }, null, 2),
      },
    ]);
  },

  suggest_knowledge: async (params, { auth, runContext }) => {
    const agentConfigurationIdRes = getTargetAgentConfigurationId(runContext);
    if (agentConfigurationIdRes.isErr()) {
      return agentConfigurationIdRes;
    }
    const agentConfigurationId = agentConfigurationIdRes.value;

    // Validate that the data source view exists and is accessible.
    const { action, method, dataSourceViewId, nodeIds, description } =
      params.suggestion;
    const view = await DataSourceViewResource.fetchById(auth, dataSourceViewId);

    if (!view || !auth.can("read", view)) {
      return new Err(
        new MCPError(
          `The data source view ID "${dataSourceViewId}" is invalid or not accessible. ` +
            `Use search_knowledge to find valid data source views.`,
          { tracked: false }
        )
      );
    }

    // Fetch pending knowledge suggestions and mark duplicates as outdated.
    const pendingSuggestions =
      await AgentSuggestionResource.listByAgentConfigurationId(
        auth,
        agentConfigurationId,
        { states: ["pending"], kind: "knowledge" }
      );

    const remainingPending = await markDuplicateSuggestionsAsOutdated(
      auth,
      pendingSuggestions,
      (s) =>
        isKnowledgeSuggestion(s.suggestion) &&
        s.suggestion.dataSourceViewId === dataSourceViewId
    );

    // Check pending suggestion limit.
    const limitCheck = canAddPendingSuggestions({
      kind: "knowledge",
      newPendingCount: 1,
      currentPendingCount: remainingPending.length,
      resolutionHint: UPDATE_SUGGESTIONS_STATE_RESOLUTION_HINT,
    });
    if (!limitCheck.allowed) {
      return new Err(new MCPError(limitCheck.errorMessage, { tracked: false }));
    }

    // Fetch the latest version of the agent configuration.
    const agent = await AgentResource.fetchById(auth, agentConfigurationId);

    if (!agent) {
      return new Err(
        new MCPError(`Agent configuration not found: ${agentConfigurationId}`, {
          tracked: false,
        })
      );
    }

    const suggestion: KnowledgeSuggestionType = {
      action,
      method,
      dataSourceViewId,
      nodeIds,
      description,
    };

    try {
      const createdSuggestion =
        await AgentSuggestionResource.createSuggestionForAgent(auth, agent, {
          kind: "knowledge",
          suggestion,
          analysis: params.analysis ?? null,
          state: "pending",
          source: "sidekick",
        });

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

  list_suggestions: async (params, { auth, runContext }) => {
    const agentConfigurationIdRes = getTargetAgentConfigurationId(runContext);
    if (agentConfigurationIdRes.isErr()) {
      return agentConfigurationIdRes;
    }
    const agentConfigurationId = agentConfigurationIdRes.value;

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
    { auth }
  ) => {
    const conversationRes = await renderConversationAsTextWithFeedback(auth, {
      conversationId,
      fromMessageIndex,
      toMessageIndex,
      includeActionDetails: true,
    });

    if (conversationRes.isErr()) {
      return new Err(
        new MCPError(
          `Conversation not found or not accessible: ${conversationId}`,
          { tracked: false }
        )
      );
    }

    return new Ok([conversationRes.value]);
  },

  inspect_message: async ({ conversationId, messageId }, extra) => {
    const auth = extra.auth;
    if (!auth) {
      return new Err(new MCPError("Authentication required"));
    }

    // oxlint-disable-next-line dust/noExpensiveConversationFetch -- intentional full conversation load
    const conversationRes = await getConversation(auth, conversationId);
    if (conversationRes.isErr()) {
      return new Err(
        new MCPError(
          `Conversation not found or not accessible: ${conversationId}`,
          { tracked: false }
        )
      );
    }

    const conversation = conversationRes.value;

    // Flatten to last version of each message, find the target by sId.
    let foundMessage:
      | UserMessageType
      | AgentMessageType
      | CompactionMessageType
      | null = null;
    let foundIndex = -1;
    const flatMessages: (
      | UserMessageType
      | AgentMessageType
      | CompactionMessageType
      | ContentFragmentType
    )[] = [];

    for (const messageVersions of conversation.content) {
      if (messageVersions.length === 0) {
        continue;
      }
      const lastVersion = messageVersions[messageVersions.length - 1];
      flatMessages.push(lastVersion);
    }

    for (let i = 0; i < flatMessages.length; i++) {
      const msg = flatMessages[i];
      if (
        (isUserMessageType(msg) ||
          isAgentMessageType(msg) ||
          isCompactionMessageType(msg)) &&
        msg.sId === messageId
      ) {
        foundMessage = msg;
        foundIndex = i;
        break;
      }
    }

    // Collect content fragments that precede the found user message.
    const contentFragments: {
      sId: string;
      title: string;
      contentType: string;
    }[] = [];

    if (foundMessage && isUserMessageType(foundMessage)) {
      for (let j = foundIndex - 1; j >= 0; j--) {
        const prev = flatMessages[j];
        if (isContentFragmentType(prev)) {
          contentFragments.unshift({
            sId: prev.sId,
            title: prev.title,
            contentType: prev.contentType,
          });
        } else {
          break;
        }
      }
    }

    if (!foundMessage) {
      return new Err(
        new MCPError(
          `Message not found: ${messageId} in conversation ${conversationId}`,
          { tracked: false }
        )
      );
    }

    const lines: string[] = [];

    if (isUserMessageType(foundMessage)) {
      lines.push(`# User message ${foundMessage.sId}`);
      lines.push(`at ${foundMessage.created}`);
      lines.push(
        `from ${foundMessage.context.username} (${foundMessage.context.email})`
      );
      if (foundMessage.context.origin) {
        lines.push(`origin: ${foundMessage.context.origin}`);
      }
      const mentions = foundMessage.mentions.filter(isAgentMention);
      if (mentions.length > 0) {
        lines.push(
          `mentions: ${mentions.map((m) => m.configurationId).join(", ")}`
        );
      }
      lines.push("");

      if (contentFragments.length > 0) {
        lines.push("## Content fragments");
        for (const cf of contentFragments) {
          lines.push(`- ${cf.title} (${cf.contentType}) [${cf.sId}]`);
        }
        lines.push("");
      }

      lines.push("## Content");
      lines.push(foundMessage.content ?? "_empty_");
      lines.push("");

      return new Ok([
        {
          type: "text" as const,
          text: lines.join("\n"),
        },
      ]);
    }

    if (isCompactionMessageType(foundMessage)) {
      lines.push(`# Compaction message ${foundMessage.sId}`);
      lines.push(`at ${foundMessage.created}`);
      lines.push("");

      lines.push("## Content");
      lines.push(foundMessage.content ?? "_empty_");
      lines.push("");

      return new Ok([
        {
          type: "text" as const,
          text: lines.join("\n"),
        },
      ]);
    }

    // Agent message.
    const agentMsg = foundMessage;
    const status = agentMsg.status === "succeeded" ? "succeeded" : "failed";

    lines.push(
      `# Agent message ${agentMsg.sId} from ${agentMsg.configuration.sId} (${agentMsg.configuration.name}) - ${status}`
    );
    lines.push(`at ${agentMsg.created}`);
    if (agentMsg.parentMessageId) {
      lines.push(`parent message: ${agentMsg.parentMessageId}`);
    }
    if (agentMsg.parentAgentMessageId) {
      lines.push(`parent agent message: ${agentMsg.parentAgentMessageId}`);
    }
    lines.push("");

    if (agentMsg.error) {
      lines.push(
        `**Error** [${agentMsg.error.code}]: ${agentMsg.error.message}`
      );
      lines.push("");
    }

    // Actions.
    if (agentMsg.actions.length > 0) {
      lines.push("## Actions");
      for (const action of agentMsg.actions) {
        const actionStatus =
          action.status === "succeeded" ? "success" : "error";
        lines.push(
          `### ${action.functionCallName} (${actionStatus}) [${action.sId}]`
        );
        lines.push(`at ${action.createdAt}`);
        if (action.executionDurationMs !== null) {
          lines.push(`duration: ${action.executionDurationMs}ms`);
        }
        if (action.internalMCPServerName === "run_agent") {
          const childConvId = action.params.conversationId;
          if (isString(childConvId)) {
            lines.push(`child conversation: ${childConvId}`);
          }
        }
        lines.push("");
        lines.push("**Input:**");
        lines.push("```json");
        lines.push(JSON.stringify(action.params, null, 2));
        lines.push("```");
        lines.push("");
        lines.push("**Output:**");
        lines.push("```json");
        lines.push(JSON.stringify(action.output, null, 2));
        lines.push("```");
        lines.push("");
      }
    }

    // Find agents that this message handed off to.
    const handoffTargets: { agentId: string; agentName: string }[] = [];
    for (const msg of flatMessages) {
      if (
        isAgentMessageType(msg) &&
        msg.parentAgentMessageId === agentMsg.sId
      ) {
        handoffTargets.push({
          agentId: msg.configuration.sId,
          agentName: msg.configuration.name,
        });
      }
    }
    if (handoffTargets.length > 0) {
      lines.push(
        `Handed off to: ${handoffTargets.map((h) => `${h.agentId} (${h.agentName})`).join(", ")}`
      );
      lines.push("");
    }

    if (agentMsg.chainOfThought) {
      lines.push("## Chain of thought");
      lines.push(agentMsg.chainOfThought);
      lines.push("");
    }

    lines.push("## Content");
    lines.push(agentMsg.content ?? "_empty_");
    lines.push("");

    return new Ok([
      {
        type: "text" as const,
        text: lines.join("\n"),
      },
    ]);
  },

  update_suggestions_state: async (params, { auth }) => {
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
};

export const TOOLS = buildTools(
  AGENT_SIDEKICK_CONTEXT_TOOLS_METADATA,
  handlers
);
