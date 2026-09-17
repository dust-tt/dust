import type { SkillEditorsChange } from "@app/lib/api/skills/editors_change";
import { validateSkillEditorsChange } from "@app/lib/api/skills/editors_change";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { pruneConflictingSkillEditorsSuggestions } from "@app/lib/reinforcement/skill_suggestion_pruning";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import {
  isEditorsSkillSuggestion,
  parseSkillSuggestionData,
} from "@app/types/suggestions/skill_suggestion";

/**
 * What a suggestion asks to change on the skill. `editors` is not a skill field: it is written as
 * per-user grants, so it travels here but is applied separately from `updateSkill`.
 */
interface SkillEdits {
  agentFacingDescription?: string;
  editors?: { addUserIds: string[]; removeUserIds: string[] };
}

function editsForSuggestion(
  suggestion: SkillSuggestionResource
): Result<SkillEdits, DustError<"invalid_request_error">> {
  const data = parseSkillSuggestionData({
    kind: suggestion.kind,
    suggestion: suggestion.suggestion,
  });

  switch (data.kind) {
    case "edit":
      if (data.suggestion.instructionEdits?.length) {
        return new Err(
          new DustError(
            "invalid_request_error",
            "Instruction edits cannot be applied to the skill yet."
          )
        );
      }

      return new Ok({
        agentFacingDescription:
          data.suggestion.agentFacingDescriptionEdit?.content,
      });

    case "editors":
      return new Ok({ editors: data.suggestion });

    default:
      assertNever(data);
  }
}

/**
 * Folds what every accepted suggestion asks for into one set of changes, so a batch produces one
 * skill version.
 */
function mergeSkillEdits(edits: SkillEdits[]): SkillEdits {
  return edits.reduce<SkillEdits>(
    (merged, next) => ({
      agentFacingDescription:
        next.agentFacingDescription ?? merged.agentFacingDescription,
      // Unioned rather than overwritten: a batch asks for every editor change it carries. A user
      // added by one suggestion and removed by another ends up in both lists, which
      // `validateSkillEditorsChange` then rejects as ambiguous.
      editors: mergeEditorsEdits(merged.editors, next.editors),
    }),
    {}
  );
}

function mergeEditorsEdits(
  merged: SkillEdits["editors"],
  next: SkillEdits["editors"]
): SkillEdits["editors"] {
  if (!merged || !next) {
    return next ?? merged;
  }

  return {
    addUserIds: [...new Set([...merged.addUserIds, ...next.addUserIds])],
    removeUserIds: [
      ...new Set([...merged.removeUserIds, ...next.removeUserIds]),
    ],
  };
}

function hasSkillFieldEdits({ agentFacingDescription }: SkillEdits): boolean {
  return agentFacingDescription !== undefined;
}

async function updateSkill(
  auth: Authenticator,
  skill: SkillResource,
  edits: SkillEdits
): Promise<void> {
  const attachedKnowledge = await skill.getAttachedKnowledge(auth);

  // `updateSkill` replaces the whole skill, so every field no suggestion touched is carried over
  // from the current values.
  await skill.updateSkill(auth, {
    agentFacingDescription:
      edits.agentFacingDescription ?? skill.agentFacingDescription,
    attachedKnowledge,
    icon: skill.icon,
    instructions: skill.instructions,
    instructionsHtml: skill.instructionsHtml,
    manuallyRequestedSpaceIds: skill.manuallyRequestedSpaceIds,
    mcpServerViews: skill.mcpServerViews,
    name: skill.name,
    requestedSpaceIds: skill.requestedSpaceIds,
    userFacingDescription: skill.userFacingDescription,
  });
}

// Adding before removing to prevent orphaning the skill
async function applyEditorsChange(
  auth: Authenticator,
  skill: SkillResource,
  { usersToAdd, usersToRemove }: SkillEditorsChange
): Promise<Result<undefined, DustError<"invalid_request_error">>> {
  const addRes = await skill.addEditors(auth, usersToAdd);
  if (addRes.isErr()) {
    return new Err(
      new DustError("invalid_request_error", addRes.error.message)
    );
  }

  const removeRes = await skill.removeEditors(auth, usersToRemove);
  if (removeRes.isErr()) {
    return new Err(
      new DustError("invalid_request_error", removeRes.error.message)
    );
  }

  return new Ok(undefined);
}

export async function applySkillSuggestions(
  auth: Authenticator,
  {
    skill,
    suggestions,
  }: { skill: SkillResource; suggestions: SkillSuggestionResource[] }
): Promise<Result<undefined, DustError<"invalid_request_error">>> {
  const perSuggestionEdits: SkillEdits[] = [];

  for (const suggestion of suggestions) {
    const suggestionEdits = editsForSuggestion(suggestion);
    if (suggestionEdits.isErr()) {
      return suggestionEdits;
    }

    perSuggestionEdits.push(suggestionEdits.value);
  }

  const edits = mergeSkillEdits(perSuggestionEdits);

  // Everything is validated before anything is written: an editor change recorded days ago is only
  // as good as the workspace it lands in.
  let editorsChange: SkillEditorsChange | null = null;
  if (edits.editors) {
    const validation = await validateSkillEditorsChange(
      auth,
      skill,
      edits.editors
    );
    if (validation.isErr()) {
      return new Err(
        new DustError("invalid_request_error", validation.error.message)
      );
    }

    editorsChange = validation.value;
  }

  // `updateSkill` saves a version, so a batch that only moves editors must not call it.
  if (hasSkillFieldEdits(edits)) {
    await updateSkill(auth, skill, edits);
  }

  if (editorsChange) {
    const applyRes = await applyEditorsChange(auth, skill, editorsChange);
    if (applyRes.isErr()) {
      return applyRes;
    }

    for (const suggestion of suggestions.filter(isEditorsSkillSuggestion)) {
      await pruneConflictingSkillEditorsSuggestions(auth, skill, suggestion);
    }
  }

  return new Ok(undefined);
}
