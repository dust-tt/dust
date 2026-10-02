import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import { validateStructuredOutputChange } from "@app/lib/api/assistant/configuration/model_update";
import type { Authenticator } from "@app/lib/auth";
import {
  buildDescendantMap,
  instructionBlockSetsConflict,
} from "@app/lib/editor/instructions_block_conflict";
import type { AgentResource } from "@app/lib/resources/agent_resource";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { BatchSuggestionResource } from "@app/lib/resources/batch_suggestion_resource";
import logger from "@app/logger/logger";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import { removeNulls } from "@app/types/shared/utils/general";
import type {
  InstructionsSuggestionSchemaType,
  ModelSuggestionType,
  SkillsSuggestionType,
  StructuredOutputSuggestionType,
  SubAgentSuggestionType,
  ToolsSuggestionType,
} from "@app/types/suggestions/agent_suggestion";
import {
  INSTRUCTIONS_ROOT_TARGET_BLOCK_ID,
  parseAgentSuggestionData,
} from "@app/types/suggestions/agent_suggestion";

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

type StructuredOutputSuggestionResource = AgentSuggestionResource & {
  kind: "structured_output";
  suggestion: StructuredOutputSuggestionType;
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
  structured_output: StructuredOutputSuggestionResource;
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
    structured_output: [],
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
    } else if (isSuggestionOfKind(suggestion, "structured_output")) {
      result.structured_output.push(suggestion);
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
async function pruneSuggestions(
  auth: Authenticator,
  agent: AgentResource,
  pendingSuggestions: AgentSuggestionResource[]
): Promise<void> {
  if (pendingSuggestions.length === 0) {
    return;
  }

  const { tools, sub_agent, skills, model, structured_output, instructions } =
    splitByKind(pendingSuggestions);

  const agentModel = agent.effectiveModelConfiguration;
  const [actions, { instructionsHtml }] = await Promise.all([
    agent.listActions(auth),
    agent.fetchInstructions(),
  ]);

  const outdatedByKind = await Promise.all([
    getOutdatedToolsSuggestions(tools, actions),
    getOutdatedSubAgentSuggestions(sub_agent, actions),
    getOutdatedSkillsSuggestions(auth, skills, agent),
    getOutdatedModelSuggestions(
      model,
      agentModel.modelId,
      agentModel.reasoningEffort ?? null
    ),
    getOutdatedStructuredOutputSuggestions(
      structured_output,
      model,
      agentModel
    ),
    getInstructionSuggestionsWithoutExistingBlockId(
      instructions,
      instructionsHtml
    ),
  ]);

  await outdateAgentSuggestions(auth, outdatedByKind.flat());
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
  agent: AgentResource
): Promise<SkillsSuggestionResource[]> {
  if (suggestions.length === 0) {
    return [];
  }
  const currentSkills = await agent.listSkills(auth);
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
 * Outdated if the agent already has the suggested structured output, or if its model does not
 * support structured output and no model suggestion of the same batch changes it.
 */
function getOutdatedStructuredOutputSuggestions(
  suggestions: StructuredOutputSuggestionResource[],
  modelSuggestions: ModelSuggestionResource[],
  currentModel: AgentConfigurationType["model"]
): StructuredOutputSuggestionResource[] {
  const batchIdsChangingModel = new Set(
    removeNulls(modelSuggestions.map((s) => s.batchId))
  );
  const currentResponseFormat = currentModel.responseFormat ?? null;

  return suggestions.filter(({ suggestion: { responseFormat }, batchId }) => {
    if (responseFormat === currentResponseFormat) {
      return true;
    }
    if (batchId !== null && batchIdsChangingModel.has(batchId)) {
      return false;
    }
    return validateStructuredOutputChange({
      modelId: currentModel.modelId,
      responseFormat,
    }).isErr();
  });
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

/**
 * Marks existing instruction suggestions as outdated when new suggestions conflict.
 *
 * Conflict rules:
 * - Same block ID: New suggestion replaces old one
 * - Parent-child hierarchy: Parent change invalidates child suggestions
 * - instructions-root (new): Full rewrite invalidates all block suggestions
 * - instructions-root (existing): Block-level new suggestions invalidate existing root (mutually exclusive)
 */
export async function pruneConflictingInstructionSuggestions(
  auth: Authenticator,
  agent: AgentResource,
  newSuggestions: Array<{ sId: string; targetBlockId: string }>
): Promise<void> {
  if (newSuggestions.length === 0) {
    return;
  }

  const allPending = await AgentSuggestionResource.listByAgentConfigurationId(
    auth,
    agent.sId,
    { states: ["pending"], kind: "instructions" }
  );

  const newSuggestionIds = new Set(newSuggestions.map((s) => s.sId));
  const existingPending = allPending.filter(
    (s) => !newSuggestionIds.has(s.sId)
  ) as InstructionsSuggestionResource[];

  if (existingPending.length === 0) {
    return;
  }

  const newTargetBlockIds = new Set(newSuggestions.map((s) => s.targetBlockId));

  const allBlockIds = new Set([
    ...newTargetBlockIds,
    ...existingPending.map((s) => s.suggestion.targetBlockId),
  ]);
  const { instructionsHtml } = await agent.fetchInstructions();
  const descendantMap = instructionsHtml
    ? buildDescendantMap(instructionsHtml, allBlockIds)
    : new Map<string, Set<string>>();

  const toMarkOutdated = existingPending.filter((existingSugg) =>
    instructionBlockSetsConflict(
      newTargetBlockIds,
      new Set([existingSugg.suggestion.targetBlockId]),
      instructionsHtml,
      descendantMap
    )
  );

  await outdateAgentSuggestions(auth, toMarkOutdated);
}

export async function pruneSuggestionsForAgent(
  auth: Authenticator,
  agent: AgentResource
): Promise<void> {
  const pendingSuggestions =
    await AgentSuggestionResource.listByAgentConfigurationId(auth, agent.sId, {
      states: ["pending"],
    });

  await pruneSuggestions(auth, agent, pendingSuggestions);
}

/**
 * @cc [owner:fabiencelier,label:product] outdate-through-batch
 * Every agent suggestion pruning outdates MUST go through `outdateAgentSuggestions`: a suggestion
 * that belongs to a batch outdates its whole batch (see `batch-outdated-as-a-whole`), the others
 * are outdated on their own.
 */
export async function outdateAgentSuggestions(
  auth: Authenticator,
  suggestions: AgentSuggestionResource[]
): Promise<void> {
  if (suggestions.length === 0) {
    return;
  }

  await AgentSuggestionResource.bulkUpdateState(
    auth,
    suggestions.filter((s) => s.batchId === null),
    "outdated"
  );
  await BatchSuggestionResource.outdateBatchesOf(auth, [
    ...new Set(removeNulls(suggestions.map((s) => s.batchId))),
  ]);
}

/**
 * Marks as outdated the pending suggestions that match the predicate, and returns the other ones.
 */
export async function markDuplicateSuggestionsAsOutdated(
  auth: Authenticator,
  pendingSuggestions: AgentSuggestionResource[],
  isDuplicate: (suggestion: AgentSuggestionResource) => boolean
): Promise<AgentSuggestionResource[]> {
  const duplicates = pendingSuggestions.filter(isDuplicate);
  await outdateAgentSuggestions(auth, duplicates);

  return pendingSuggestions.filter((s) => !isDuplicate(s));
}

/**
 * Outdates the pending suggestions superseded by newly recorded ones of singleton kinds: at most one
 * suggestion of such a kind stays pending per agent.
 * `pending` may or may not contain the recorded suggestions, they are never outdated.
 */
export async function pruneSupersededSingletonSuggestions(
  auth: Authenticator,
  {
    pending,
    recorded,
  }: {
    pending: AgentSuggestionResource[];
    recorded: AgentSuggestionResource[];
  }
): Promise<void> {
  const recordedKinds = new Set(recorded.map((s) => s.kind));
  const recordedIds = new Set(recorded.map((s) => s.id));

  await outdateAgentSuggestions(
    auth,
    pending.filter((s) => recordedKinds.has(s.kind) && !recordedIds.has(s.id))
  );
}
