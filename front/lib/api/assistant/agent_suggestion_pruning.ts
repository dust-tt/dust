import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import type { Authenticator } from "@app/lib/auth";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import logger from "@app/logger/logger";
import type { AgentConfigurationType } from "@app/types";
import type {
  InstructionsSuggestionType,
  ModelSuggestionType,
  SkillsSuggestionType,
  ToolsSuggestionType,
} from "@app/types/suggestions/agent_suggestion";
import { parseAgentSuggestionData } from "@app/types/suggestions/agent_suggestion";

type ToolsSuggestionResource = AgentSuggestionResource & {
  kind: "tools";
  suggestion: ToolsSuggestionType;
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
  suggestion: InstructionsSuggestionType;
};

// Maps each kind to its corresponding resource type.
type SuggestionResourceByKind = {
  tools: ToolsSuggestionResource;
  skills: SkillsSuggestionResource;
  model: ModelSuggestionResource;
  instructions: InstructionsSuggestionResource;
};

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
    skills: [],
    model: [],
    instructions: [],
  };

  for (const suggestion of suggestions) {
    if (isSuggestionOfKind(suggestion, "tools")) {
      result.tools.push(suggestion);
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

  const { tools, skills, model, instructions } =
    splitByKind(pendingSuggestions);

  const outdatedByKind = await Promise.all([
    getOutdatedToolsSuggestions(tools, agentConfiguration.actions),
    getOutdatedSkillsSuggestions(auth, skills, agentConfiguration),
    getOutdatedModelSuggestions(
      model,
      agentConfiguration.model.modelId,
      agentConfiguration.model.reasoningEffort ?? null
    ),
    getOutdatedInstructionsSuggestions(
      instructions,
      agentConfiguration.instructions
    ),
  ]);

  const allOutdated = outdatedByKind.flat();
  await AgentSuggestionResource.bulkUpdateState(auth, allOutdated, "outdated");
}

/** Outdated if any addition already exists or any deletion no longer exists. */
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
    let isOutdated = false;

    if (suggestion.suggestion.additions) {
      for (const addition of suggestion.suggestion.additions) {
        if (currentToolIds.has(addition.id)) {
          isOutdated = true;
          break;
        }
      }
    }

    if (!isOutdated && suggestion.suggestion.deletions) {
      for (const deletion of suggestion.suggestion.deletions) {
        if (!currentToolIds.has(deletion)) {
          isOutdated = true;
          break;
        }
      }
    }

    if (isOutdated) {
      outdatedSuggestions.push(suggestion);
    }
  }

  return outdatedSuggestions;
}

/** Outdated if any addition already exists or any deletion no longer exists. */
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
    let isOutdated = false;

    if (suggestion.suggestion.additions) {
      for (const addition of suggestion.suggestion.additions) {
        if (currentSkillIds.has(addition)) {
          isOutdated = true;
          break;
        }
      }
    }

    if (!isOutdated && suggestion.suggestion.deletions) {
      for (const deletion of suggestion.suggestion.deletions) {
        if (!currentSkillIds.has(deletion)) {
          isOutdated = true;
          break;
        }
      }
    }

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

function getOutdatedInstructionsSuggestions(
  suggestions: InstructionsSuggestionResource[],
  currentInstructions: string | null
): InstructionsSuggestionResource[] {
  if (suggestions.length === 0) {
    return [];
  }

  const outdatedSuggestions: InstructionsSuggestionResource[] = [];

  // Suggestions are already sorted by createdAt DESC (most recent first).
  // We process them in order, tracking applied regions in the edited prompt.
  let editedInstructions = currentInstructions ?? "";
  const appliedRegions: Array<{ start: number; end: number }> = [];

  for (const suggestion of suggestions) {
    const result = canApplyInstructionSuggestion(
      suggestion.suggestion,
      currentInstructions,
      editedInstructions,
      appliedRegions
    );

    if (!result.canApply) {
      outdatedSuggestions.push(suggestion);
    } else {
      // Apply the suggestion to the edited instructions and track the regions.
      const { newEditedInstructions, newRegions, regionShift } = result;
      editedInstructions = newEditedInstructions;

      // Shift existing regions that come after the first new region by the total shift.
      if (newRegions.length > 0 && regionShift !== 0) {
        const firstNewRegionStart = newRegions[0].start;
        for (const region of appliedRegions) {
          if (region.start >= firstNewRegionStart) {
            region.start += regionShift;
            region.end += regionShift;
          }
        }
      }

      appliedRegions.push(...newRegions);
    }
  }

  return outdatedSuggestions;
}

/**
 * Checks if an instruction suggestion can be applied.
 * Returns whether it can be applied, and if so, the updated edited instructions
 * and the regions that were modified.
 *
 * When expectedOccurrences > 1, all occurrences must be replaceable without
 * overlapping each other or any previously applied regions.
 */
function canApplyInstructionSuggestion(
  suggestion: InstructionsSuggestionType,
  currentInstructions: string | null,
  editedInstructions: string,
  appliedRegions: Array<{ start: number; end: number }>
):
  | { canApply: false }
  | {
      canApply: true;
      newEditedInstructions: string;
      newRegions: Array<{ start: number; end: number }>;
      regionShift: number;
    } {
  const { oldString, newString, expectedOccurrences } = suggestion;

  // Check 1: oldString must exist in current instructions.
  if (
    currentInstructions === null ||
    !currentInstructions.includes(oldString)
  ) {
    return { canApply: false };
  }

  const positions = findAllOccurrences(editedInstructions, oldString);

  // Verify occurrence count.
  if (expectedOccurrences !== undefined) {
    if (positions.length !== expectedOccurrences) {
      return { canApply: false };
    }
  } else {
    if (positions.length !== 1) {
      return { canApply: false };
    }
  }

  // Compute the range of characters that actually change in this suggestion.
  // This allows suggestions with overlapping source regions but non-overlapping
  // changes to both remain valid.
  const changedRange = computeChangedRange(oldString, newString);

  const newRegions: Array<{ start: number; end: number }> = positions.map(
    (pos) => ({
      start: pos + changedRange.start,
      end: pos + changedRange.end,
    })
  );

  // No new changed region should overlap with any applied changed region.
  for (const newRegion of newRegions) {
    for (const appliedRegion of appliedRegions) {
      if (
        regionsOverlap(
          newRegion.start,
          newRegion.end,
          appliedRegion.start,
          appliedRegion.end
        )
      ) {
        return { canApply: false };
      }
    }
  }

  // Apply all replacements from last to first (to preserve positions).
  let result = editedInstructions;
  const sortedPositions = [...positions].sort((a, b) => b - a); // Descending order
  for (const pos of sortedPositions) {
    result =
      result.substring(0, pos) +
      newString +
      result.substring(pos + oldString.length);
  }

  // Calculate final regions after replacement (tracking only the changed portion).
  const singleShift = newString.length - oldString.length;
  const totalShift = singleShift * positions.length;

  const finalRegions: Array<{ start: number; end: number }> = [];
  let accumulatedShift = 0;

  for (const pos of positions) {
    finalRegions.push({
      start: pos + changedRange.start + accumulatedShift,
      end: pos + changedRange.end + accumulatedShift,
    });
    accumulatedShift += singleShift;
  }

  return {
    canApply: true,
    newEditedInstructions: result,
    newRegions: finalRegions,
    regionShift: totalShift,
  };
}

/** Returns all positions of substr in str (non-overlapping). */
function findAllOccurrences(str: string, substr: string): number[] {
  const positions: number[] = [];
  let pos = 0;
  while ((pos = str.indexOf(substr, pos)) !== -1) {
    positions.push(pos);
    pos += substr.length; // Move past this occurrence (non-overlapping)
  }
  return positions;
}

function regionsOverlap(
  start1: number,
  end1: number,
  start2: number,
  end2: number
): boolean {
  // Regions overlap if one starts before the other ends and vice versa.
  return start1 < end2 && start2 < end1;
}

/**
 * Computes the range of characters that actually change between oldString and newString.
 * Returns a {start, end} range relative to the oldString positions,
 * where start is inclusive and end is exclusive.
 *
 * For example:
 * - "ABC" -> "AXC" returns {start: 1, end: 2} (only B changes to X)
 * - "ABC" -> "AXXC" returns {start: 1, end: 2} (B is replaced, insertion happens there)
 * - "ABCD" -> "AXYD" returns {start: 1, end: 3} (BC changes to XY)
 *
 * TODO(copilot): We may store this in DB to avoid recomputing it each time.
 */
function computeChangedRange(
  oldString: string,
  newString: string
): { start: number; end: number } {
  // Find common prefix length.
  let prefixLen = 0;
  while (
    prefixLen < oldString.length &&
    prefixLen < newString.length &&
    oldString[prefixLen] === newString[prefixLen]
  ) {
    prefixLen++;
  }

  // Find common suffix length (but don't overlap with prefix).
  let suffixLen = 0;
  while (
    suffixLen < oldString.length - prefixLen &&
    suffixLen < newString.length - prefixLen &&
    oldString[oldString.length - 1 - suffixLen] ===
      newString[newString.length - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  // The changed region in oldString is from prefixLen to (oldString.length - suffixLen).
  const changedStart = prefixLen;
  const changedEnd = oldString.length - suffixLen;

  return { start: changedStart, end: Math.max(changedStart, changedEnd) };
}
