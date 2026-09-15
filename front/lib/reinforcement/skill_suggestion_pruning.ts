import type { Authenticator } from "@app/lib/auth";
import {
  buildDescendantMap,
  getAllBlockIds,
  instructionBlockSetsConflict,
} from "@app/lib/editor/instructions_block_conflict";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import type {
  SkillEditSuggestionType,
  SkillInstructionEditItemType,
  SkillSuggestionSource,
} from "@app/types/suggestions/skill_suggestion";
import { getSkillEditSuggestion } from "@app/types/suggestions/skill_suggestion";

// Reviewable suggestions: pruning applies to every source a user may accept or reject, whether
// it is surfaced in the builder (`reinforcement`) or inline in a conversation (`conversational`).
const PRUNED_SOURCES: SkillSuggestionSource[] = [
  "reinforcement",
  "conversational",
];

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
 * Returns true if a single suggestion's edits are internally inconsistent.
 */
export function hasSuggestionSelfConflict(
  suggestion: SkillEditSuggestionType,
  instructionsHtml: string | null
): boolean {
  const instructionEdits = suggestion.instructionEdits ?? [];

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

  return false;
}

/**
 * @cc [owner:fabiencelier,label:product] prune-all-reviewable-sources
 * Conflict pruning MUST consider pending `edit` suggestions from every reviewable source
 * (`reinforcement` and `conversational`) regardless of the new suggestion's own source, so that two
 * pending suggestions never target overlapping regions of a skill.
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
      sources: PRUNED_SOURCES,
    }
  );

  const existingPending = allPending.filter((s) => s.sId !== newSuggestion.sId);
  if (existingPending.length === 0) {
    return;
  }

  const newEdit = getSkillEditSuggestion(newSuggestion);
  if (!newEdit) {
    return;
  }
  const newInstructionEdits = newEdit.instructionEdits ?? [];
  const newHasAgentFacingDescriptionEdit =
    newEdit.agentFacingDescriptionEdit !== undefined;

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
  const existingEdits = new Map(
    existingPending.map((p) => [p.sId, getSkillEditSuggestion(p)])
  );
  for (const edit of existingEdits.values()) {
    for (const e of edit?.instructionEdits ?? []) {
      allInstructionTargetIds.add(e.targetBlockId);
    }
  }
  const descendantMap =
    skill.instructionsHtml && allInstructionTargetIds.size > 0
      ? buildDescendantMap(skill.instructionsHtml, allInstructionTargetIds)
      : new Map<string, Set<string>>();

  const toMarkOutdated = existingPending.filter((existing) => {
    const existingEdit = existingEdits.get(existing.sId);
    const existingHasAgentFacingDescriptionEdit =
      existingEdit?.agentFacingDescriptionEdit !== undefined;
    return (
      instructionEditSetsConflict(
        newInstructionEdits,
        existingEdit?.instructionEdits ?? [],
        skill.instructionsHtml,
        descendantMap
      ) ||
      (newHasAgentFacingDescriptionEdit &&
        existingHasAgentFacingDescriptionEdit)
    );
  });

  await SkillSuggestionResource.bulkUpdateState(
    auth,
    toMarkOutdated,
    "outdated"
  );
}

/**
 * @cc [owner:fabiencelier,label:product] outdate-all-reviewable-sources
 * After a skill edit, pending `edit` suggestions from every reviewable source (`reinforcement` and
 * `conversational`) whose target block no longer exists MUST be marked `outdated`.
 */
export async function pruneOutdatedSkillEditSuggestions(
  auth: Authenticator,
  skill: SkillResource
): Promise<void> {
  const pending = await SkillSuggestionResource.listBySkillConfigurationId(
    auth,
    skill.sId,
    { states: ["pending"], kind: "edit", sources: PRUNED_SOURCES }
  );
  if (pending.length === 0) {
    return;
  }

  const currentBlockIds = skill.instructionsHtml
    ? getAllBlockIds(skill.instructionsHtml)
    : new Set<string>();

  const outdated = pending.filter((p) => {
    const instructionEdits = getSkillEditSuggestion(p)?.instructionEdits;

    // We do not do a diff check to determine if the content of a specific instruction block has changed.
    // Taking this simplification as it is a low impact edge case.
    for (const edit of instructionEdits ?? []) {
      // If the target block is the instructions root block or the block no longer exists, mark the suggestion as outdated.
      // The root block suggestion would overwrite the entire instructions, so we mark it as outdated as we know it is missing the new updates.
      if (
        edit.targetBlockId === INSTRUCTIONS_ROOT_TARGET_BLOCK_ID ||
        !currentBlockIds.has(edit.targetBlockId)
      ) {
        return true;
      }
    }

    return false;
  });

  await SkillSuggestionResource.bulkUpdateState(auth, outdated, "outdated");
}
