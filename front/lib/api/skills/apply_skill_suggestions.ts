import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import type { SkillEditorsChange } from "@app/lib/api/skills/editors_change";
import { validateSkillEditorsChange } from "@app/lib/api/skills/editors_change";
import { validateSkillNameChange } from "@app/lib/api/skills/name_change";
import type { Authenticator } from "@app/lib/auth";
import type { AppliedSkillInstructions } from "@app/lib/editor/skill_instructions_html";
import {
  applyInstructionEditsToHtml,
  convertMarkdownToBlockHtml,
} from "@app/lib/editor/skill_instructions_html";
import { DustError } from "@app/lib/error";
import {
  pruneConflictingSkillEditorsSuggestions,
  pruneConflictingSkillNameSuggestions,
  pruneConflictingSkillUserFacingDescriptionSuggestions,
} from "@app/lib/reinforcement/skill_suggestion_pruning";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { SkillInstructionEditItemType } from "@app/types/suggestions/skill_suggestion";
import {
  isEditorsSkillSuggestion,
  isNameSkillSuggestion,
  isUserFacingDescriptionSkillSuggestion,
  parseSkillSuggestionData,
} from "@app/types/suggestions/skill_suggestion";
import { UniqueConstraintError } from "sequelize";

/**
 * What a suggestion asks to change on the skill. `editors` is not a skill field: it is written as
 * per-user grants, so it travels here but is applied separately from `updateSkill`.
 */
interface SkillEdits {
  agentFacingDescription?: string;
  userFacingDescription?: string;
  name?: string;
  editors?: { addUserIds: string[]; removeUserIds: string[] };
  instructionEdits?: SkillInstructionEditItemType[];
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
      return new Ok({
        agentFacingDescription:
          data.suggestion.agentFacingDescriptionEdit?.content,
        instructionEdits: data.suggestion.instructionEdits,
      });

    case "editors":
      return new Ok({ editors: data.suggestion });

    case "user_facing_description":
      return new Ok({
        userFacingDescription: data.suggestion.userFacingDescription,
      });

    case "name":
      return new Ok({ name: data.suggestion.name });

    default:
      assertNever(data);
  }
}

/**
 * Folds what every accepted suggestion asks for into one set of changes, so a batch produces one
 * skill version.
 */
function mergeSkillEdits(edits: SkillEdits[]): SkillEdits {
  const agentFacingDescription = edits.reduce<string | undefined>(
    (merged, next) => next.agentFacingDescription ?? merged,
    undefined
  );
  const userFacingDescription = edits.reduce<string | undefined>(
    (merged, next) => next.userFacingDescription ?? merged,
    undefined
  );
  const name = edits.reduce<string | undefined>(
    (merged, next) => next.name ?? merged,
    undefined
  );

  // Concatenated in suggestion order: every accepted edit is applied, each to its own block.
  const instructionEdits = edits.flatMap((e) => e.instructionEdits ?? []);

  // Union, not last-wins: approving two suggestions must apply both editor changes.
  const editorsEdits = edits.flatMap((e) => e.editors ?? []);
  if (editorsEdits.length === 0) {
    return {
      agentFacingDescription,
      userFacingDescription,
      name,
      instructionEdits,
    };
  }

  return {
    agentFacingDescription,
    userFacingDescription,
    name,
    instructionEdits,
    editors: {
      addUserIds: [...new Set(editorsEdits.flatMap((e) => e.addUserIds))],
      removeUserIds: [...new Set(editorsEdits.flatMap((e) => e.removeUserIds))],
    },
  };
}

function hasSkillFieldEdits({
  agentFacingDescription,
  userFacingDescription,
  name,
  instructionEdits,
}: SkillEdits): boolean {
  return (
    agentFacingDescription !== undefined ||
    userFacingDescription !== undefined ||
    name !== undefined ||
    (instructionEdits?.length ?? 0) > 0
  );
}

function resolveInstructions(
  skill: SkillResource,
  instructionEdits: SkillInstructionEditItemType[] | undefined
): Result<
  AppliedSkillInstructions | undefined,
  DustError<"invalid_request_error">
> {
  if (!instructionEdits?.length) {
    return new Ok(undefined);
  }
  const instructionsHtml =
    skill.instructionsHtml ?? convertMarkdownToBlockHtml("");

  return applyInstructionEditsToHtml(instructionsHtml, instructionEdits);
}

async function applySkillFieldEdits(
  auth: Authenticator,
  skill: SkillResource,
  {
    agentFacingDescription,
    userFacingDescription,
    name,
    instructionEdits,
  }: SkillEdits
): Promise<Result<undefined, DustError<"invalid_request_error">>> {
  const instructions = resolveInstructions(skill, instructionEdits);
  if (instructions.isErr()) {
    return instructions;
  }

  const attachedKnowledge = await skill.getAttachedKnowledge(auth);

  // `updateSkill` replaces the whole skill, so every field no suggestion touched is carried over
  // from the current values.
  await skill.updateSkill(auth, {
    agentFacingDescription:
      agentFacingDescription ?? skill.agentFacingDescription,
    attachedKnowledge,
    icon: skill.icon,
    instructions: instructions.value?.instructions ?? skill.instructions,
    instructionsHtml:
      instructions.value?.instructionsHtml ?? skill.instructionsHtml,
    manuallyRequestedSpaceIds: skill.manuallyRequestedSpaceIds,
    mcpServerViews: skill.mcpServerViews,
    name: name ?? skill.name,
    requestedSpaceIds: skill.requestedSpaceIds,
    userFacingDescription: userFacingDescription ?? skill.userFacingDescription,
  });

  return new Ok(undefined);
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

  void emitAuditLogEvent({
    auth,
    action: "skill.editors_updated",
    targets: [
      buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
      { type: "skill", id: skill.sId, name: skill.name },
    ],
    context: getAuditLogContext(auth),
    metadata: {
      skill_name: skill.name,
      added_editor_ids: usersToAdd.map((u) => u.sId).join(","),
      removed_editor_ids: usersToRemove.map((u) => u.sId).join(","),
      actor_added_self: String(
        usersToAdd.some((u) => u.sId === auth.user()?.sId)
      ),
    },
  });

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

  let edits = mergeSkillEdits(perSuggestionEdits);

  if (edits.name !== undefined) {
    const validation = await validateSkillNameChange(auth, skill, {
      name: edits.name,
    });
    if (validation.isErr()) {
      return new Err(
        new DustError("invalid_request_error", validation.error.message)
      );
    }
    // Write the validator's trimmed name, never the raw suggestion payload.
    edits = { ...edits, name: validation.value.name };
  }

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

  // TODO(achilleburah): make the editor change and skill update atomic so if editors changes fails,
  //  the skill update is rolled back.

  // `updateSkill` saves a version, so a batch that only moves editors must not call it.
  if (hasSkillFieldEdits(edits)) {
    // The name was validated above, but a concurrent rename or creation can still take it before
    // the write lands; the unique index is the last word.
    try {
      const updateRes = await applySkillFieldEdits(auth, skill, edits);
      if (updateRes.isErr()) {
        return updateRes;
      }
    } catch (error) {
      if (error instanceof UniqueConstraintError && edits.name !== undefined) {
        return new Err(
          new DustError(
            "invalid_request_error",
            `A skill with the name "${edits.name}" already exists.`
          )
        );
      }
      throw error;
    }
    await pruneConflictingSkillUserFacingDescriptionSuggestions(
      auth,
      skill,
      suggestions.filter(isUserFacingDescriptionSkillSuggestion)
    );
    await pruneConflictingSkillNameSuggestions(
      auth,
      skill,
      suggestions.filter(isNameSkillSuggestion)
    );
  }

  if (editorsChange) {
    const applyRes = await applyEditorsChange(auth, skill, editorsChange);
    if (applyRes.isErr()) {
      return applyRes;
    }

    await pruneConflictingSkillEditorsSuggestions(
      auth,
      skill,
      suggestions.filter(isEditorsSkillSuggestion)
    );
  }

  return new Ok(undefined);
}
