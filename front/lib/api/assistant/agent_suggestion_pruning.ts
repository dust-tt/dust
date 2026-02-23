import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { Authenticator } from "@app/lib/auth";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import logger from "@app/logger/logger";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type {
  InstructionsSuggestionSchemaType,
  ModelSuggestionType,
  SkillsSuggestionType,
  SubAgentSuggestionType,
  ToolsSuggestionType,
} from "@app/types/suggestions/agent_suggestion";
import {
  INSTRUCTIONS_ROOT_TARGET_BLOCK_ID,
  parseAgentSuggestionData,
} from "@app/types/suggestions/agent_suggestion";
import { JSDOM } from "jsdom";

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

  const { tools, sub_agent, skills, model, instructions } =
    splitByKind(pendingSuggestions);

  const outdatedByKind = await Promise.all([
    getOutdatedToolsSuggestions(tools, agentConfiguration.actions),
    getOutdatedSubAgentSuggestions(sub_agent, agentConfiguration.actions),
    getOutdatedSkillsSuggestions(auth, skills, agentConfiguration),
    getOutdatedModelSuggestions(
      model,
      agentConfiguration.model.modelId,
      agentConfiguration.model.reasoningEffort ?? null
    ),
    getInstructionSuggestionsWithoutExistingBlockId(
      instructions,
      agentConfiguration.instructionsHtml
    ),
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

function extractBlockIds(instructionsHtml: string): Set<string> {
  const blockIds = new Set<string>();
  const blockIdRegex = /data-block-id="([^"]+)"/g;
  let match;

  while ((match = blockIdRegex.exec(instructionsHtml)) !== null) {
    blockIds.add(match[1]);
  }

  return blockIds;
}

function getInstructionSuggestionsWithoutExistingBlockId(
  suggestions: InstructionsSuggestionResource[],
  currentInstructions: string | null
): InstructionsSuggestionResource[] {
  if (suggestions.length === 0) {
    return [];
  }

  if (!currentInstructions) {
    return suggestions;
  }

  const currentBlockIds = extractBlockIds(currentInstructions);
  const outdatedSuggestions: InstructionsSuggestionResource[] = [];

  for (const suggestion of suggestions) {
    const { targetBlockId } = suggestion.suggestion;

    if (targetBlockId === INSTRUCTIONS_ROOT_TARGET_BLOCK_ID) {
      continue;
    }

    if (!currentBlockIds.has(targetBlockId)) {
      outdatedSuggestions.push(suggestion);
    }
  }

  return outdatedSuggestions;
}

function getDescendantBlockIds(
  instructionsHtml: string,
  targetBlockId: string
): Set<string> {
  const descendants = new Set<string>();

  const dom = new JSDOM(instructionsHtml);
  const doc = dom.window.document;

  const targetElement = doc.querySelector(`[data-block-id="${targetBlockId}"]`);
  if (!targetElement) {
    return descendants;
  }

  const descendantElements = targetElement.querySelectorAll("[data-block-id]");
  descendantElements.forEach((element) => {
    const descendantId = element.getAttribute("data-block-id");
    if (descendantId && descendantId !== targetBlockId) {
      descendants.add(descendantId);
    }
  });

  return descendants;
}

/**
 * Marks existing instruction suggestions as outdated when new suggestions conflict.
 *
 * Conflict rules:
 * - Same block ID: New suggestion replaces old one
 * - Parent-child hierarchy: Parent change invalidates child suggestions
 * - instructions-root: Full rewrite invalidates all block suggestions
 */
export async function pruneConflictingInstructionSuggestions(
  auth: Authenticator,
  agentConfiguration: AgentConfigurationType,
  newSuggestions: Array<{ sId: string; targetBlockId: string }>
): Promise<void> {
  if (newSuggestions.length === 0) {
    return;
  }

  if (!agentConfiguration.instructionsHtml) {
    return;
  }

  const allPending = await AgentSuggestionResource.listByAgentConfigurationId(
    auth,
    agentConfiguration.sId,
    { states: ["pending"], kind: "instructions" }
  );

  const newSuggestionIds = new Set(newSuggestions.map((s) => s.sId));
  const existingPending = allPending.filter(
    (s) => !newSuggestionIds.has(s.sId)
  ) as InstructionsSuggestionResource[];

  if (existingPending.length === 0) {
    return;
  }

  // Build conflict detection sets: which blocks are being changed, and which are their descendants
  const newTargetBlockIds = new Set<string>();
  const allDescendantBlockIds = new Set<string>();

  for (const newSugg of newSuggestions) {
    const { targetBlockId } = newSugg;
    newTargetBlockIds.add(targetBlockId);

    // instructions-root is a full rewrite: mark everything outdated
    if (targetBlockId === INSTRUCTIONS_ROOT_TARGET_BLOCK_ID) {
      if (existingPending.length > 0) {
        await AgentSuggestionResource.bulkUpdateState(
          auth,
          existingPending,
          "outdated"
        );
      }
      return;
    }

    // Collect all descendants of this block (child blocks that would be replaced)
    const descendants = getDescendantBlockIds(
      agentConfiguration.instructionsHtml,
      targetBlockId
    );
    descendants.forEach((id) => allDescendantBlockIds.add(id));
  }

  const toMarkOutdated: InstructionsSuggestionResource[] = [];
  for (const existingSugg of existingPending) {
    const existingTargetId = existingSugg.suggestion.targetBlockId;

    // Conflict 1: Same block (duplicate suggestion for same target)
    if (newTargetBlockIds.has(existingTargetId)) {
      toMarkOutdated.push(existingSugg);
      continue;
    }

    // Conflict 2: Child block (existing targets a descendant that will be replaced)
    if (allDescendantBlockIds.has(existingTargetId)) {
      toMarkOutdated.push(existingSugg);
    }
  }

  if (toMarkOutdated.length > 0) {
    await AgentSuggestionResource.bulkUpdateState(
      auth,
      toMarkOutdated,
      "outdated"
    );
  }
}

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

  await pruneSuggestions(auth, agentConfiguration, pendingSuggestions);
}
