import type { Authenticator } from "@app/lib/auth";
import {
  buildDescendantMap,
  getAllBlockIds,
  instructionBlockSetsConflict,
} from "@app/lib/editor/instructions_block_conflict";
import { BatchSuggestionResource } from "@app/lib/resources/batch_suggestion_resource";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { removeNulls } from "@app/types/shared/utils/general";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import type {
  SkillAvailabilitySuggestionData,
  SkillEditorsSuggestionData,
  SkillEditSuggestionData,
  SkillEditSuggestionType,
  SkillInstructionEditItemType,
  SkillNameSuggestionData,
  SkillSuggestionSource,
  SkillUserFacingDescriptionSuggestionData,
} from "@app/types/suggestions/skill_suggestion";
import {
  isAvailabilitySkillSuggestion,
  isEditorsSkillSuggestion,
  isEditSkillSuggestion,
  isNameSkillSuggestion,
  isUserFacingDescriptionSkillSuggestion,
  REVIEWABLE_SKILL_SUGGESTION_SOURCES,
} from "@app/types/suggestions/skill_suggestion";

// `delete` suggestions are only ever recorded with source `conversational` (reinforcement never
// produces this kind), so pruning only needs to look there.
const DELETE_SUGGESTION_SOURCES: SkillSuggestionSource[] = ["conversational"];

// Reviewable suggestions: pruning applies to every source a user may accept or reject, whether
// it is surfaced in the builder (`reinforcement`) or inline in a conversation (`conversational`).
const PRUNED_SOURCES: SkillSuggestionSource[] = [
  ...REVIEWABLE_SKILL_SUGGESTION_SOURCES,
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
  newSuggestion: SkillSuggestionResource & SkillEditSuggestionData
): Promise<void> {
  const existingPending = (
    await SkillSuggestionResource.listBySkillConfigurationId(auth, skill.sId, {
      states: ["pending"],
      kinds: ["edit"],
      sources: PRUNED_SOURCES,
    })
  )
    .filter(isEditSkillSuggestion)
    .filter((s) => s.sId !== newSuggestion.sId);
  if (existingPending.length === 0) {
    return;
  }

  const newInstructionEdits = newSuggestion.suggestion.instructionEdits ?? [];
  const newHasAgentFacingDescriptionEdit =
    newSuggestion.suggestion.agentFacingDescriptionEdit !== undefined;

  // Full rewrite — everything is outdated.
  if (
    newInstructionEdits.some(
      (e) => e.targetBlockId === INSTRUCTIONS_ROOT_TARGET_BLOCK_ID
    )
  ) {
    await outdateSkillSuggestions(auth, existingPending);
    return;
  }

  // Precompute descendant map for all instruction-edit targets (new + existing) so each pair
  // check shares one parse.
  const allInstructionTargetIds = new Set<string>();
  for (const e of newInstructionEdits) {
    allInstructionTargetIds.add(e.targetBlockId);
  }
  for (const p of existingPending) {
    for (const e of p.suggestion.instructionEdits ?? []) {
      allInstructionTargetIds.add(e.targetBlockId);
    }
  }
  const descendantMap =
    skill.instructionsHtml && allInstructionTargetIds.size > 0
      ? buildDescendantMap(skill.instructionsHtml, allInstructionTargetIds)
      : new Map<string, Set<string>>();

  const toMarkOutdated = existingPending.filter((existing) => {
    const existingHasAgentFacingDescriptionEdit =
      existing.suggestion.agentFacingDescriptionEdit !== undefined;
    return (
      instructionEditSetsConflict(
        newInstructionEdits,
        existing.suggestion.instructionEdits ?? [],
        skill.instructionsHtml,
        descendantMap
      ) ||
      (newHasAgentFacingDescriptionEdit &&
        existingHasAgentFacingDescriptionEdit)
    );
  });

  await outdateSkillSuggestions(auth, toMarkOutdated);
}

/**
 * @cc [owner:achilleburah,label:product] editors-suggestion-conflict-pruning
 * Recording or applying an `editors` suggestion outdates every other pending `editors`
 * suggestion for the same skill that adds or removes the same user. Adding a user in one and
 * removing them in the other is not a conflict: both stay pending.
 */
export async function pruneConflictingSkillEditorsSuggestions(
  auth: Authenticator,
  skill: SkillResource,
  newSuggestions: (SkillSuggestionResource & SkillEditorsSuggestionData)[]
): Promise<void> {
  if (newSuggestions.length === 0) {
    return;
  }

  const excluded = new Set(newSuggestions.map((s) => s.sId));
  const pendingEditorSuggestions = (
    await SkillSuggestionResource.listBySkillConfigurationId(auth, skill.sId, {
      states: ["pending"],
      kinds: ["editors"],
      sources: PRUNED_SOURCES,
    })
  )
    .filter(isEditorsSkillSuggestion)
    .filter((s) => !excluded.has(s.sId));
  if (pendingEditorSuggestions.length === 0) {
    return;
  }

  const newAddUserIds = new Set(
    newSuggestions.flatMap((s) => s.suggestion.addUserIds)
  );
  const newRemoveUserIds = new Set(
    newSuggestions.flatMap((s) => s.suggestion.removeUserIds)
  );

  const toMarkOutdated = pendingEditorSuggestions.filter((row) => {
    const editors = row.suggestion;
    return (
      editors.addUserIds.some((id) => newAddUserIds.has(id)) ||
      editors.removeUserIds.some((id) => newRemoveUserIds.has(id))
    );
  });

  await outdateSkillSuggestions(auth, toMarkOutdated);
}

/**
 * @cc [owner:achilleburah,label:product] single-value-suggestion-conflict-pruning
 * Recording or applying a `user_facing_description` suggestion outdates every other pending
 * `user_facing_description` suggestion for the same skill: the field holds one value, so two
 * pending replacements always conflict.
 */
export async function pruneConflictingSkillUserFacingDescriptionSuggestions(
  auth: Authenticator,
  skill: SkillResource,
  newSuggestions: (SkillSuggestionResource &
    SkillUserFacingDescriptionSuggestionData)[]
): Promise<void> {
  if (newSuggestions.length === 0) {
    return;
  }

  const excluded = new Set(newSuggestions.map((s) => s.sId));
  const toMarkOutdated = (
    await SkillSuggestionResource.listBySkillConfigurationId(auth, skill.sId, {
      states: ["pending"],
      kinds: ["user_facing_description"],
      sources: PRUNED_SOURCES,
    })
  )
    .filter(isUserFacingDescriptionSkillSuggestion)
    .filter((s) => !excluded.has(s.sId));

  await outdateSkillSuggestions(auth, toMarkOutdated);
}

export async function pruneConflictingSkillNameSuggestions(
  auth: Authenticator,
  skill: SkillResource,
  newSuggestions: (SkillSuggestionResource & SkillNameSuggestionData)[]
): Promise<void> {
  if (newSuggestions.length === 0) {
    return;
  }

  const excluded = new Set(newSuggestions.map((s) => s.sId));
  const toMarkOutdated = (
    await SkillSuggestionResource.listBySkillConfigurationId(auth, skill.sId, {
      states: ["pending"],
      kinds: ["name"],
      sources: PRUNED_SOURCES,
    })
  )
    .filter(isNameSkillSuggestion)
    .filter((s) => !excluded.has(s.sId));

  await outdateSkillSuggestions(auth, toMarkOutdated);
}

/**
 * @cc [owner:avervaet,label:product] prune-conflicting-delete-suggestions
 * Recording a new pending `delete` suggestion MUST mark every other pending `delete` suggestion
 * for the same skill `outdated`, so only one deletion proposal is ever open for review at a time.
 */
export async function pruneConflictingSkillDeletionSuggestions(
  auth: Authenticator,
  skill: SkillResource,
  newSuggestion: SkillSuggestionResource
): Promise<void> {
  const conflicting = (
    await SkillSuggestionResource.listBySkillConfigurationId(auth, skill.sId, {
      states: ["pending"],
      kinds: ["delete"],
      sources: DELETE_SUGGESTION_SOURCES,
    })
  ).filter((s) => s.sId !== newSuggestion.sId);

  await outdateSkillSuggestions(auth, conflicting);
}

/**
 * @cc [owner:achilleburah,label:product] prune-conflicting-availability-suggestions
 * Recording a new `availability` suggestion, or accepting one, MUST mark every other pending
 * `availability` suggestion for the same skill `outdated`: the field holds a single value, so two
 * pending changes always conflict. This holds even when the accepted suggestion's value already
 * matches the skill's current availability and no write occurs.
 */
export async function pruneConflictingSkillAvailabilitySuggestions(
  auth: Authenticator,
  skill: SkillResource,
  newSuggestions: (SkillSuggestionResource & SkillAvailabilitySuggestionData)[]
): Promise<void> {
  if (newSuggestions.length === 0) {
    return;
  }

  const excluded = new Set(newSuggestions.map((s) => s.sId));
  const toMarkOutdated = (
    await SkillSuggestionResource.listBySkillConfigurationId(auth, skill.sId, {
      states: ["pending"],
      kinds: ["availability"],
      sources: PRUNED_SOURCES,
    })
  )
    .filter(isAvailabilitySkillSuggestion)
    .filter((s) => !excluded.has(s.sId));

  await outdateSkillSuggestions(auth, toMarkOutdated);
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
  const pending = (
    await SkillSuggestionResource.listBySkillConfigurationId(auth, skill.sId, {
      states: ["pending"],
      kinds: ["edit"],
      sources: PRUNED_SOURCES,
    })
  ).filter(isEditSkillSuggestion);
  if (pending.length === 0) {
    return;
  }

  const currentBlockIds = skill.instructionsHtml
    ? getAllBlockIds(skill.instructionsHtml)
    : new Set<string>();

  const outdated = pending.filter((p) => {
    const { instructionEdits } = p.suggestion;

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

  await outdateSkillSuggestions(auth, outdated);
}

/**
 * @cc [owner:fabiencelier,label:product] outdate-through-batch
 * Every skill suggestion pruning outdates MUST go through `outdateSkillSuggestions`: a suggestion
 * that belongs to a batch outdates its whole batch the others are outdated on their own.
 */
export async function outdateSkillSuggestions(
  auth: Authenticator,
  suggestions: SkillSuggestionResource[]
): Promise<void> {
  if (suggestions.length === 0) {
    return;
  }

  await SkillSuggestionResource.bulkUpdateState(
    auth,
    suggestions.filter((s) => s.batchId === null),
    "outdated"
  );
  await BatchSuggestionResource.outdateBatchesOf(auth, [
    ...new Set(removeNulls(suggestions.map((s) => s.batchId))),
  ]);
}
