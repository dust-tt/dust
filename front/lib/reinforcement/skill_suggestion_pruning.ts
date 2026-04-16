import type { Authenticator } from "@app/lib/auth";
import {
  buildDescendantMap,
  instructionBlockSetsConflict,
} from "@app/lib/editor/instructions_block_conflict";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import type {
  SkillEditSuggestionType,
  SkillInstructionEditItemType,
  SkillToolEditItemType,
} from "@app/types/suggestions/skill_suggestion";

/**
 * Returns true if two sets of instruction edits target overlapping parts of the HTML tree.
 *
 * @param descendantMap Optional pre-built map of blockId -> descendants to avoid
 *   repeated HTML parsing when called in a loop. Build once with buildDescendantMap.
 */
export function instructionEditSetsConflict(
  editsA: SkillInstructionEditItemType[],
  editsB: SkillInstructionEditItemType[],
  instructionsHtml: string | null,
  descendantMap: Map<string, Set<string>>
): boolean {
  if (editsA.length === 0 || editsB.length === 0) {
    return false;
  }
  return instructionBlockSetsConflict(
    new Set(editsA.map((e) => e.targetBlockId)),
    new Set(editsB.map((e) => e.targetBlockId)),
    instructionsHtml,
    descendantMap
  );
}

/**
 * Returns true if two sets of tool edits target the same tool ID.
 */
export function toolEditSetsConflict(
  editsA: SkillToolEditItemType[],
  editsB: SkillToolEditItemType[]
): boolean {
  const toolIdsA = new Set(editsA.map((e) => e.toolId));
  return editsB.some((e) => toolIdsA.has(e.toolId));
}

/**
 * Returns true if a single suggestion's edits are internally inconsistent.
 */
export function hasSuggestionSelfConflict(
  suggestion: SkillEditSuggestionType,
  instructionsHtml: string | null
): boolean {
  const instructionEdits = suggestion.instructionEdits ?? [];
  const toolEdits = suggestion.toolEdits ?? [];

  // O(n²) acceptable: instructionEdits is bounded by LLM output (< 20 elements per suggestion).
  // Precompute descendant map once to avoid repeated HTML parsing across all pair checks.
  const descendantMap = instructionsHtml
    ? buildDescendantMap(
        instructionsHtml,
        instructionEdits.map((e) => e.targetBlockId)
      )
    : new Map<string, Set<string>>();

  for (let i = 0; i < instructionEdits.length; i++) {
    for (let j = i + 1; j < instructionEdits.length; j++) {
      if (
        instructionEditSetsConflict(
          [instructionEdits[i]],
          [instructionEdits[j]],
          instructionsHtml,
          descendantMap
        )
      ) {
        return true;
      }
    }
  }

  const toolIds = toolEdits.map((e) => e.toolId);
  if (new Set(toolIds).size < toolIds.length) {
    return true;
  }

  return false;
}

/**
 * Marks existing pending skill edit suggestions as outdated when a new suggestion conflicts.
 */
export async function pruneConflictingSkillEditSuggestions(
  auth: Authenticator,
  skill: SkillResource,
  newSuggestion: SkillSuggestionResource
): Promise<void> {
  const allPending = await SkillSuggestionResource.listBySkillConfigurationId(
    auth,
    skill.sId,
    {
      states: ["pending"],
      kind: "edit",
    }
  );

  const existingPending = allPending.filter((s) => s.sId !== newSuggestion.sId);
  if (existingPending.length === 0) {
    return;
  }

  const newData = newSuggestion.toJSON();
  const newInstructionEdits = newData.suggestion.instructionEdits ?? [];
  const newToolEdits = newData.suggestion.toolEdits ?? [];

  // Full rewrite — everything is outdated.
  if (
    newInstructionEdits.some(
      (e) => e.targetBlockId === INSTRUCTIONS_ROOT_TARGET_BLOCK_ID
    )
  ) {
    await SkillSuggestionResource.bulkUpdateState(
      auth,
      existingPending,
      "outdated"
    );
    return;
  }

  // Precompute descendant map for all instruction-edit targets (new + existing) so each pair
  // check shares one parse.
  const allInstructionTargetIds = new Set<string>();
  for (const e of newInstructionEdits) {
    allInstructionTargetIds.add(e.targetBlockId);
  }
  for (const p of existingPending) {
    for (const e of p.toJSON().suggestion.instructionEdits ?? []) {
      allInstructionTargetIds.add(e.targetBlockId);
    }
  }
  const descendantMap =
    skill.instructionsHtml && allInstructionTargetIds.size > 0
      ? buildDescendantMap(skill.instructionsHtml, allInstructionTargetIds)
      : new Map<string, Set<string>>();

  const toMarkOutdated = existingPending.filter((existing) => {
    const existingData = existing.toJSON();
    return (
      instructionEditSetsConflict(
        newInstructionEdits,
        existingData.suggestion.instructionEdits ?? [],
        skill.instructionsHtml,
        descendantMap
      ) ||
      toolEditSetsConflict(
        newToolEdits,
        existingData.suggestion.toolEdits ?? []
      )
    );
  });

  await SkillSuggestionResource.bulkUpdateState(
    auth,
    toMarkOutdated,
    "outdated"
  );
}
