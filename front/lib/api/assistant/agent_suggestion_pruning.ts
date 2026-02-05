import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { Authenticator } from "@app/lib/auth";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import logger from "@app/logger/logger";
import type { AgentConfigurationType } from "@app/types";
import type {
  InstructionsSuggestionSchemaType,
  ModelSuggestionType,
  SkillsSuggestionType,
  SubAgentSuggestionType,
  ToolsSuggestionType,
} from "@app/types/suggestions/agent_suggestion";
import { parseAgentSuggestionData } from "@app/types/suggestions/agent_suggestion";

type ToolsSuggestionResource = AgentSuggestionResource & {
  kind: "tools";
  suggestion: ToolsSuggestionType;
};

type SubAgentSuggestionResource = AgentSuggestionResource & {
  kind: "sub_agent";
  suggestion: SubAgentSuggestionType;
};

type SkillsSuggestionResource = AgentSuggestionResource & {
  kind: "skills";
  suggestion: SkillsSuggestionType;
};

type ModelSuggestionResource = AgentSuggestionResource & {
  kind: "model";
  suggestion: ModelSuggestionType;
};

type InstructionsSuggestionResource = AgentSuggestionResource & {
  kind: "instructions";
  suggestion: InstructionsSuggestionSchemaType;
};

// Maps each kind to its corresponding resource type.
interface SuggestionResourceByKind {
  instructions: InstructionsSuggestionResource;
  model: ModelSuggestionResource;
  skills: SkillsSuggestionResource;
  sub_agent: SubAgentSuggestionResource;
  tools: ToolsSuggestionResource;
}

type SuggestionsByKind = {
  [K in keyof SuggestionResourceByKind]: SuggestionResourceByKind[K][];
};

/**
 * Type guard that validates both kind and suggestion payload together.
 * Uses the Zod discriminated union to ensure the payload matches the kind.
 */
function isSuggestionOfKind<K extends keyof SuggestionResourceByKind>(
  suggestion: AgentSuggestionResource,
  kind: K
): suggestion is SuggestionResourceByKind[K] {
  if (suggestion.kind !== kind) {
    return false;
  }
  const result = parseAgentSuggestionData({
    kind: suggestion.kind,
    suggestion: suggestion.suggestion,
  });
  return result.kind === kind;
}

function splitByKind(
  suggestions: AgentSuggestionResource[]
): SuggestionsByKind {
  const result: SuggestionsByKind = {
    tools: [],
    sub_agent: [],
    skills: [],
    model: [],
    instructions: [],
  };

  for (const suggestion of suggestions) {
    if (isSuggestionOfKind(suggestion, "tools")) {
      result.tools.push(suggestion);
    } else if (isSuggestionOfKind(suggestion, "sub_agent")) {
      result.sub_agent.push(suggestion);
    } else if (isSuggestionOfKind(suggestion, "skills")) {
      result.skills.push(suggestion);
    } else if (isSuggestionOfKind(suggestion, "model")) {
      result.model.push(suggestion);
    } else if (isSuggestionOfKind(suggestion, "instructions")) {
      result.instructions.push(suggestion);
    } else {
      logger.warn(
        { suggestionId: suggestion.id, kind: suggestion.kind },
        "Invalid suggestion payload for kind"
      );
    }
  }

  return result;
}

/**
 * Prunes pending suggestions that can no longer be applied to the agent.
 * This should be called after saving an agent configuration to mark
 * outdated suggestions.
 *
 * Runs pruning checks in parallel for each suggestion kind, then bulk updates
 * all outdated suggestions in a single database call.
 */
export async function pruneSuggestions(
  auth: Authenticator,
  agentConfiguration: AgentConfigurationType,
  pendingSuggestions: AgentSuggestionResource[]
): Promise<void> {
  if (pendingSuggestions.length === 0) {
    return;
  }

  const { tools, sub_agent, skills, model } = splitByKind(pendingSuggestions);

  const outdatedByKind = await Promise.all([
    getOutdatedToolsSuggestions(tools, agentConfiguration.actions),
    getOutdatedSubAgentSuggestions(sub_agent, agentConfiguration.actions),
    getOutdatedSkillsSuggestions(auth, skills, agentConfiguration),
    getOutdatedModelSuggestions(
      model,
      agentConfiguration.model.modelId,
      agentConfiguration.model.reasoningEffort ?? null
    ),
    // TODO(2026-02-05 COPILOT) Implement proper pruning for instructions suggestions based on block id and block inheritance.
    // getOutdatedInstructionsSuggestions(
    //   instructions,
    //   agentConfiguration.instructions
    // ),
  ]);

  const allOutdated = outdatedByKind.flat();
  await AgentSuggestionResource.bulkUpdateState(auth, allOutdated, "outdated");
}

/** Outdated if tool to add already exists or tool to remove no longer exists. */
function getOutdatedToolsSuggestions(
  suggestions: ToolsSuggestionResource[],
  currentActions: MCPServerConfigurationType[]
): ToolsSuggestionResource[] {
  // Collect mcpServerViewIds from current actions.
  // Suggestions store the mcpServerViewId as the tool identifier.
  const currentToolIds = new Set<string>();

  for (const action of currentActions) {
    if ("mcpServerViewId" in action && action.mcpServerViewId) {
      currentToolIds.add(action.mcpServerViewId);
    }
  }

  const outdatedSuggestions: ToolsSuggestionResource[] = [];

  for (const suggestion of suggestions) {
    const { action, toolId } = suggestion.suggestion;
    const isOutdated =
      action === "add"
        ? currentToolIds.has(toolId)
        : !currentToolIds.has(toolId);

    if (isOutdated) {
      outdatedSuggestions.push(suggestion);
    }
  }

  return outdatedSuggestions;
}

/** Outdated if sub-agent to add already exists or sub-agent to remove no longer exists. */
function getOutdatedSubAgentSuggestions(
  suggestions: SubAgentSuggestionResource[],
  currentActions: MCPServerConfigurationType[]
): SubAgentSuggestionResource[] {
  // For sub-agent tools (run_agent), track childAgentIds.
  const currentChildAgentIds = new Set<string>();

  for (const action of currentActions) {
    if ("childAgentId" in action && action.childAgentId) {
      currentChildAgentIds.add(action.childAgentId);
    }
  }

  const outdatedSuggestions: SubAgentSuggestionResource[] = [];

  for (const suggestion of suggestions) {
    const { action, childAgentId } = suggestion.suggestion;
    const isOutdated =
      action === "add"
        ? currentChildAgentIds.has(childAgentId)
        : !currentChildAgentIds.has(childAgentId);

    if (isOutdated) {
      outdatedSuggestions.push(suggestion);
    }
  }

  return outdatedSuggestions;
}

/** Outdated if skill to add already exists or skill to remove no longer exists. */
async function getOutdatedSkillsSuggestions(
  auth: Authenticator,
  suggestions: SkillsSuggestionResource[],
  agentConfiguration: AgentConfigurationType
): Promise<SkillsSuggestionResource[]> {
  if (suggestions.length === 0) {
    return [];
  }
  const currentSkills = await SkillResource.listByAgentConfiguration(
    auth,
    agentConfiguration
  );
  const currentSkillIds = new Set(currentSkills.map((s) => s.sId));

  const outdatedSuggestions: SkillsSuggestionResource[] = [];

  for (const suggestion of suggestions) {
    const { action, skillId } = suggestion.suggestion;
    const isOutdated =
      action === "add"
        ? currentSkillIds.has(skillId)
        : !currentSkillIds.has(skillId);

    if (isOutdated) {
      outdatedSuggestions.push(suggestion);
    }
  }

  return outdatedSuggestions;
}

/** Outdated if current model AND reasoning effort (when provided) match. */
function getOutdatedModelSuggestions(
  suggestions: ModelSuggestionResource[],
  currentModelId: string,
  currentReasoningEffort: string | null
): ModelSuggestionResource[] {
  const outdatedSuggestions: ModelSuggestionResource[] = [];

  for (const suggestion of suggestions) {
    // Model must match.
    if (suggestion.suggestion.modelId !== currentModelId) {
      continue;
    }

    // If reasoning effort is provided in the suggestion, it must also match.
    if (suggestion.suggestion.reasoningEffort !== undefined) {
      if (suggestion.suggestion.reasoningEffort !== currentReasoningEffort) {
        continue;
      }
    }

    // Both model and reasoning effort (if provided) match -> outdated.
    outdatedSuggestions.push(suggestion);
  }

  return outdatedSuggestions;
}

/**
 * Prunes pending suggestions for an agent configuration.
 * Fetches pending suggestions and marks outdated ones.
 *
 * This should be called after saving an agent configuration.
 */
export async function pruneSuggestionsForAgent(
  auth: Authenticator,
  agentConfiguration: AgentConfigurationType
): Promise<void> {
  const pendingSuggestions =
    await AgentSuggestionResource.listByAgentConfigurationId(
      auth,
      agentConfiguration.sId,
      { states: ["pending"] }
    );

  // TODO(2026-02-05 COPILOT) Implement proper pruning based on block id and block inheritance.
  await pruneSuggestions(auth, agentConfiguration, pendingSuggestions);
}
