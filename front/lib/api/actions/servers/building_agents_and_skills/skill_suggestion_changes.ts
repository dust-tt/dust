import { MCPError } from "@app/lib/actions/mcp_errors";
import { validateSkillAvailabilityChange } from "@app/lib/api/skills/availability_change";
import { validateSkillDeletion } from "@app/lib/api/skills/deletion";
import { validateSkillEditorsChange } from "@app/lib/api/skills/editors_change";
import { validateSkillNameChange } from "@app/lib/api/skills/name_change";
import { isAuthorizedForSkillSuggestionKind } from "@app/lib/api/skills/suggestion_authorization";
import { checkSkillWritable } from "@app/lib/api/skills/write_access";
import type { Authenticator } from "@app/lib/auth";
import { findUnknownTargetBlockIds } from "@app/lib/editor/instructions_block_conflict";
import {
  hasSuggestionSelfConflict,
  pruneConflictingSkillAvailabilitySuggestions,
  pruneConflictingSkillDeletionSuggestions,
  pruneConflictingSkillEditorsSuggestions,
  pruneConflictingSkillEditSuggestions,
  pruneConflictingSkillNameSuggestions,
  pruneConflictingSkillUserFacingDescriptionSuggestions,
} from "@app/lib/reinforcement/skill_suggestion_pruning";
import type { BatchSuggestionResource } from "@app/lib/resources/batch_suggestion_resource";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { USER_FACING_DESCRIPTION_MAX_LENGTH } from "@app/lib/skills/labels";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { SkillAvailability } from "@app/types/assistant/skill_configuration_constants";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type {
  SkillAgentFacingDescriptionEditType,
  SkillAvailabilitySuggestionType,
  SkillEditorsSuggestionType,
  SkillEditSuggestionType,
  SkillInstructionEditItemType,
  SkillNameSuggestionType,
  SkillSuggestionData,
  SkillUserFacingDescriptionSuggestionType,
} from "@app/types/suggestions/skill_suggestion";
import {
  isAvailabilitySkillSuggestion,
  isEditorsSkillSuggestion,
  isEditSkillSuggestion,
  isNameSkillSuggestion,
  isUserFacingDescriptionSkillSuggestion,
} from "@app/types/suggestions/skill_suggestion";

// Validators shared by the single-change `suggest_skill_*` tools and the `suggest` tool. They run
// against live state and never write, so a batch can validate every change before recording any.

/** Instruction edits and/or an agent-facing description replacement (`edit` kind). */
export function validateSkillEditSuggestion(
  auth: Authenticator,
  skill: SkillResource,
  {
    instructionEdits,
    agentFacingDescriptionEdit,
  }: {
    instructionEdits?: SkillInstructionEditItemType[];
    agentFacingDescriptionEdit?: SkillAgentFacingDescriptionEditType;
  }
): Result<SkillEditSuggestionType, MCPError> {
  const writable = checkSkillWritable(auth, skill);
  if (writable.isErr()) {
    return new Err(new MCPError(writable.error.message));
  }

  const hasInstructionEdits = (instructionEdits?.length ?? 0) > 0;
  if (!hasInstructionEdits && agentFacingDescriptionEdit === undefined) {
    return new Err(
      new MCPError(
        "Provide at least one of `instructionEdits` or `agentFacingDescriptionEdit`."
      )
    );
  }

  if (hasInstructionEdits && !skill.instructionsHtml) {
    return new Err(
      new MCPError(
        "This skill has no block-structured instructions, so `instructionEdits` cannot be " +
          "targeted. Suggest an `agentFacingDescriptionEdit` instead."
      )
    );
  }

  if (hasInstructionEdits && skill.instructionsHtml) {
    const unknownBlockIds = findUnknownTargetBlockIds(
      skill.instructionsHtml,
      (instructionEdits ?? []).map((edit) => edit.targetBlockId)
    );
    if (unknownBlockIds.length > 0) {
      return new Err(
        new MCPError(
          `These blocks do not exist in the skill's instructions: ${unknownBlockIds.join(", ")}.`
        )
      );
    }
  }

  const suggestion = { instructionEdits, agentFacingDescriptionEdit };

  if (hasSuggestionSelfConflict(suggestion, skill.instructionsHtml)) {
    return new Err(
      new MCPError(
        "The suggested instruction edits overlap (a block and one of its descendants are " +
          "both targeted). Target each region of the instructions only once."
      )
    );
  }

  return new Ok(suggestion);
}

export function validateSkillUserFacingDescriptionSuggestion(
  auth: Authenticator,
  skill: SkillResource,
  { userFacingDescription }: { userFacingDescription: string }
): Result<SkillUserFacingDescriptionSuggestionType, MCPError> {
  const writable = checkSkillWritable(auth, skill);
  if (writable.isErr()) {
    return new Err(new MCPError(writable.error.message));
  }

  if (userFacingDescription.length === 0) {
    return new Err(
      new MCPError("Provide a non-empty `userFacingDescription`.")
    );
  }

  if (userFacingDescription.length > USER_FACING_DESCRIPTION_MAX_LENGTH) {
    return new Err(
      new MCPError(
        `The user-facing description must be at most ${USER_FACING_DESCRIPTION_MAX_LENGTH} characters.`
      )
    );
  }

  return new Ok({ userFacingDescription });
}

export async function validateSkillNameSuggestion(
  auth: Authenticator,
  skill: SkillResource,
  { name }: { name: string }
): Promise<Result<SkillNameSuggestionType, MCPError>> {
  const validation = await validateSkillNameChange(auth, skill, { name });
  if (validation.isErr()) {
    return new Err(new MCPError(validation.error.message));
  }

  if (validation.value.name === skill.name) {
    return new Err(new MCPError(`The skill is already named "${skill.name}".`));
  }

  return new Ok({ name: validation.value.name });
}

export function validateSkillAvailabilitySuggestion(
  auth: Authenticator,
  skill: SkillResource,
  { availability }: { availability: SkillAvailability }
): Result<SkillAvailabilitySuggestionType, MCPError> {
  const validation = validateSkillAvailabilityChange(auth, skill, {
    availability,
  });
  if (validation.isErr()) {
    return new Err(new MCPError(validation.error.message));
  }

  if (validation.value === null) {
    return new Err(
      new MCPError(`The skill's availability is already "${availability}".`)
    );
  }

  return new Ok({ availability });
}

export async function validateSkillEditorsSuggestion(
  auth: Authenticator,
  skill: SkillResource,
  {
    addUserIds,
    removeUserIds,
  }: { addUserIds: string[]; removeUserIds: string[] }
): Promise<Result<SkillEditorsSuggestionType, MCPError>> {
  const validation = await validateSkillEditorsChange(auth, skill, {
    addUserIds,
    removeUserIds,
  });
  if (validation.isErr()) {
    return new Err(new MCPError(validation.error.message));
  }

  if (addUserIds.length === 0 && removeUserIds.length === 0) {
    return new Err(
      new MCPError(
        "Provide at least one user in `addUserIds` or `removeUserIds`."
      )
    );
  }

  return new Ok({ addUserIds, removeUserIds });
}

export function validateSkillDeletionSuggestion(
  auth: Authenticator,
  skill: SkillResource
): Result<Record<string, never>, MCPError> {
  const validation = validateSkillDeletion(auth, skill);
  if (validation.isErr()) {
    return new Err(new MCPError(validation.error.message));
  }

  return new Ok({});
}

/**
 * Checks the verb the suggestion kind requires (`skill-suggestion-kind-required-verb`) up front,
 * so a batch fails before any write instead of `createSuggestionForSkill` throwing mid-batch.
 */
export function checkSkillSuggestionKindAuthorized(
  auth: Authenticator,
  skill: SkillResource,
  data: SkillSuggestionData
): Result<undefined, MCPError> {
  if (!isAuthorizedForSkillSuggestionKind(auth, skill, data.kind)) {
    return new Err(
      new MCPError(
        `You are not allowed to suggest a "${data.kind}" change on this skill.`
      )
    );
  }

  return new Ok(undefined);
}

/**
 * Records one skill suggestion and marks the pending suggestions it supersedes `outdated`, with
 * the same pruning each single-change tool applies for its kind.
 */
export async function recordSkillSuggestion(
  auth: Authenticator,
  skill: SkillResource,
  {
    data,
    analysis,
    title,
    conversation,
    batch,
  }: {
    data: SkillSuggestionData;
    analysis: string | null;
    title: string | null;
    conversation: ConversationType;
    batch: BatchSuggestionResource | null;
  }
): Promise<SkillSuggestionResource> {
  const created = await SkillSuggestionResource.createSuggestionForSkill(
    auth,
    skill,
    {
      ...data,
      analysis,
      title,
      state: "pending",
      source: "conversational",
      sourceConversationIds: [conversation.id],
      batchId: batch?.id ?? null,
    }
  );

  switch (data.kind) {
    case "edit":
      if (isEditSkillSuggestion(created)) {
        await pruneConflictingSkillEditSuggestions(auth, skill, created);
      }
      break;
    case "user_facing_description":
      if (isUserFacingDescriptionSkillSuggestion(created)) {
        await pruneConflictingSkillUserFacingDescriptionSuggestions(
          auth,
          skill,
          [created]
        );
      }
      break;
    case "name":
      if (isNameSkillSuggestion(created)) {
        await pruneConflictingSkillNameSuggestions(auth, skill, [created]);
      }
      break;
    case "availability":
      if (isAvailabilitySkillSuggestion(created)) {
        await pruneConflictingSkillAvailabilitySuggestions(auth, skill, [
          created,
        ]);
      }
      break;
    case "editors":
      if (isEditorsSkillSuggestion(created)) {
        await pruneConflictingSkillEditorsSuggestions(auth, skill, [created]);
      }
      break;
    case "delete":
      await pruneConflictingSkillDeletionSuggestions(auth, skill, created);
      break;
    case "create":
      // A creation targets its own placeholder skill: nothing else can conflict with it.
      break;
    default:
      assertNever(data);
  }

  return created;
}
