import type { Authenticator } from "@app/lib/auth";
import { instructionBlockSetsConflict } from "@app/lib/editor/instructions_block_conflict";
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
 */
export function instructionEditSetsConflict(
  editsA: SkillInstructionEditItemType[],
  editsB: SkillInstructionEditItemType[],
  instructionsHtml: string | null
): boolean {
  if (editsA.length === 0 || editsB.length === 0) {
    return false;
  }
  return instructionBlockSetsConflict(
    new Set(editsA.map((e) => e.targetBlockId)),
    new Set(editsB.map((e) => e.targetBlockId)),
    instructionsHtml
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

  for (let i = 0; i < instructionEdits.length; i++) {
    for (let j = i + 1; j < instructionEdits.length; j++) {
      if (
        instructionEditSetsConflict(
          [instructionEdits[i]],
          [instructionEdits[j]],
          instructionsHtml
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

  const toMarkOutdated = existingPending.filter((existing) => {
    const existingData = existing.toJSON();
    return (
      instructionEditSetsConflict(
        newInstructionEdits,
        existingData.suggestion.instructionEdits ?? [],
        skill.instructionsHtml
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
