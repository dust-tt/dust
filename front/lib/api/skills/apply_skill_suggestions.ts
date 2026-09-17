import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
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
  const agentFacingDescription = edits.reduce<string | undefined>(
    (merged, next) => next.agentFacingDescription ?? merged,
    undefined
  );

  // Union, not last-wins: approving two suggestions must apply both editor changes.
  const editorsEdits = edits.flatMap((e) => e.editors ?? []);
  if (editorsEdits.length === 0) {
    return { agentFacingDescription };
  }

  return {
    agentFacingDescription,
    editors: {
      addUserIds: [...new Set(editorsEdits.flatMap((e) => e.addUserIds))],
      removeUserIds: [...new Set(editorsEdits.flatMap((e) => e.removeUserIds))],
    },
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

  const edits = mergeSkillEdits(perSuggestionEdits);

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
    await updateSkill(auth, skill, edits);
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
