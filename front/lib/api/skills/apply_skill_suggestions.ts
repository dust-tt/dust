import {
  buildAuditLogTarget,
  emitAuditLogEvent,
  getAuditLogContext,
} from "@app/lib/api/audit/workos_audit";
import { validateSkillAvailabilityChange } from "@app/lib/api/skills/availability_change";
import { validateSkillDeletion } from "@app/lib/api/skills/deletion";
import type { SkillEditorsChange } from "@app/lib/api/skills/editors_change";
import { validateSkillEditorsChange } from "@app/lib/api/skills/editors_change";
import { validateSkillNameChange } from "@app/lib/api/skills/name_change";
import { findSkillEditorsWithoutAccessToSpaceIds } from "@app/lib/api/skills/space_requirements";
import type { Authenticator } from "@app/lib/auth";
import type { AppliedSkillInstructions } from "@app/lib/editor/skill_instructions_html";
import {
  applyInstructionEditsToHtml,
  convertMarkdownToBlockHtml,
} from "@app/lib/editor/skill_instructions_html";
import { DustError } from "@app/lib/error";
import { extractKnowledgeTagReferences } from "@app/lib/knowledge/format";
import {
  pruneConflictingSkillAvailabilitySuggestions,
  pruneConflictingSkillEditorsSuggestions,
  pruneConflictingSkillNameSuggestions,
  pruneConflictingSkillUserFacingDescriptionSuggestions,
} from "@app/lib/reinforcement/skill_suggestion_pruning";
import { DataSourceViewResource } from "@app/lib/resources/data_source_view_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import type { SkillAttachedKnowledge } from "@app/lib/resources/skill/skill_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { extractToolTags } from "@app/lib/tools/format";
import type { SkillAvailability } from "@app/types/assistant/skill_configuration_constants";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { removeNulls } from "@app/types/shared/utils/general";
import type { SkillInstructionEditItemType } from "@app/types/suggestions/skill_suggestion";
import {
  isAvailabilitySkillSuggestion,
  isEditorsSkillSuggestion,
  isNameSkillSuggestion,
  isUserFacingDescriptionSkillSuggestion,
  parseSkillSuggestionData,
} from "@app/types/suggestions/skill_suggestion";
import uniq from "lodash/uniq";

/**
 * What a suggestion asks to change on the skill. `editors` is not a skill field: it is written as
 * per-user grants, so it travels here but is applied separately from `updateSkill`. `archive` is
 * not a field either: it is a terminal status change applied through `skill.archive`, never
 * combined with other edits in practice, but folded in here so a mixed batch still fails loudly
 * instead of silently dropping the deletion.
 */
interface SkillEdits {
  agentFacingDescription?: string;
  userFacingDescription?: string;
  name?: string;
  availability?: SkillAvailability;
  editors?: { addUserIds: string[]; removeUserIds: string[] };
  instructionEdits?: SkillInstructionEditItemType[];
  archive?: boolean;
}

function editsForSuggestion(
  suggestion: SkillSuggestionResource
): Result<SkillEdits, DustError<"invalid_request_error">> {
  const data = parseSkillSuggestionData({
    kind: suggestion.kind,
    suggestion: suggestion.suggestion,
  });

  switch (data.kind) {
    case "availability":
      return new Ok({ availability: data.suggestion.availability });

    case "create":
      return new Err(
        new DustError(
          "invalid_request_error",
          "Skill creation suggestions cannot be applied to the skill yet."
        )
      );

    case "delete":
      return new Ok({ archive: true });

    case "edit":
      return new Ok({
        agentFacingDescription:
          data.suggestion.agentFacingDescriptionEdit?.content,
        instructionEdits: data.suggestion.instructionEdits,
      });

    case "editors":
      return new Ok({ editors: data.suggestion });

    case "name":
      return new Ok({ name: data.suggestion.name });

    case "user_facing_description":
      return new Ok({
        userFacingDescription: data.suggestion.userFacingDescription,
      });

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
  const availability = edits.reduce<SkillAvailability | undefined>(
    (merged, next) => next.availability ?? merged,
    undefined
  );

  // Concatenated in suggestion order: every accepted edit is applied, each to its own block.
  const instructionEdits = edits.flatMap((e) => e.instructionEdits ?? []);

  const archive = edits.some((e) => e.archive);

  // Union, not last-wins: approving two suggestions must apply both editor changes.
  const editorsEdits = edits.flatMap((e) => e.editors ?? []);
  if (editorsEdits.length === 0) {
    return {
      agentFacingDescription,
      userFacingDescription,
      name,
      availability,
      instructionEdits,
      archive,
    };
  }

  return {
    agentFacingDescription,
    userFacingDescription,
    name,
    availability,
    instructionEdits,
    archive,
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
  availability,
  instructionEdits,
}: SkillEdits): boolean {
  return (
    agentFacingDescription !== undefined ||
    userFacingDescription !== undefined ||
    name !== undefined ||
    availability !== undefined ||
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

async function resolveInstructionAttachments(
  auth: Authenticator,
  instructions: string
): Promise<
  Result<
    {
      attachedKnowledge: SkillAttachedKnowledge[];
      mcpServerViews: MCPServerViewResource[];
    },
    DustError<"invalid_request_error">
  >
> {
  const toolReferences = extractToolTags(instructions);
  const mcpServerViewIds = uniq(toolReferences.map((t) => t.id));
  const mcpServerViews = mcpServerViewIds.length
    ? await MCPServerViewResource.fetchByIds(auth, mcpServerViewIds)
    : [];
  const resolvedToolIds = new Set(
    mcpServerViews.filter((v) => v.canRead(auth)).map((v) => v.sId)
  );

  const knowledgeReferences = extractKnowledgeTagReferences(instructions);
  const dataSourceViewIds = uniq(
    removeNulls(knowledgeReferences.map((k) => k.dataSourceViewId))
  );
  const dataSourceViews = dataSourceViewIds.length
    ? await DataSourceViewResource.fetchByIds(auth, dataSourceViewIds)
    : [];
  const dataSourceViewsById = new Map(
    dataSourceViews
      .filter((dsv) => dsv.canRead(auth))
      .map((dsv) => [dsv.sId, dsv])
  );

  const attachedKnowledge: SkillAttachedKnowledge[] = [];
  const unresolved: string[] = [];

  for (const { dataSourceViewId, id, title } of knowledgeReferences) {
    const dataSourceView = dataSourceViewId
      ? dataSourceViewsById.get(dataSourceViewId)
      : undefined;

    if (dataSourceView) {
      attachedKnowledge.push({ dataSourceView, nodeId: id });
    } else {
      unresolved.push(`knowledge "${title}" (${id})`);
    }
  }

  for (const { id, name } of toolReferences) {
    if (!resolvedToolIds.has(id)) {
      unresolved.push(`tool "${name}" (${id})`);
    }
  }

  if (unresolved.length > 0) {
    return new Err(
      new DustError(
        "invalid_request_error",
        `These instructions reference resources you cannot use: ` +
          `${unresolved.join(", ")}. ` +
          `They do not exist, or they live in a space you cannot read.`
      )
    );
  }

  return new Ok({ attachedKnowledge, mcpServerViews });
}

/**
 * The tools, knowledge and spaces the skill must hold once `instructions` are in place.
 *
 * `PATCH /skills/:sId` computes the same spaces from what the builder's editor sends it; here the
 * rewritten instructions are the only source, so the attachments are read back out of them first.
 */
async function resolveInstructionRequirements(
  auth: Authenticator,
  skill: SkillResource,
  instructions: string
): Promise<
  Result<
    {
      attachedKnowledge: SkillAttachedKnowledge[];
      mcpServerViews: MCPServerViewResource[];
      requestedSpaceIds: ModelId[];
    },
    DustError<"invalid_request_error">
  >
> {
  const attachments = await resolveInstructionAttachments(auth, instructions);
  if (attachments.isErr()) {
    return attachments;
  }

  const { attachedKnowledge, mcpServerViews } = attachments.value;

  return new Ok({
    attachedKnowledge,
    mcpServerViews,
    requestedSpaceIds: await SkillResource.computeRequestedSpaceIds(auth, {
      attachedKnowledge,
      mcpServerViews,
      excludedSkillId: skill.sId,
      instructions,
      manuallyRequestedSpaceIds: skill.manuallyRequestedSpaceIds,
    }),
  });
}

async function applySkillFieldEdits(
  auth: Authenticator,
  skill: SkillResource,
  {
    agentFacingDescription,
    userFacingDescription,
    name,
    availability,
    instructionEdits,
  }: SkillEdits
): Promise<Result<undefined, DustError<"invalid_request_error">>> {
  const instructions = resolveInstructions(skill, instructionEdits);
  if (instructions.isErr()) {
    return instructions;
  }

  // Read before the write: `updateSkill` replaces the skill, so the audit event below could no
  // longer tell what the availability was.
  const previousAvailability = skill.availability;

  // A batch that does not change the instructions keeps the attachments it already has: nothing it
  // changed can add or drop a reference.
  const requirementsRes = instructions.value
    ? await resolveInstructionRequirements(
        auth,
        skill,
        instructions.value.instructions
      )
    : new Ok({
        attachedKnowledge: await skill.getAttachedKnowledge(auth),
        mcpServerViews: skill.mcpServerViews,
        requestedSpaceIds: skill.requestedSpaceIds,
      });
  if (requirementsRes.isErr()) {
    return requirementsRes;
  }
  const requirements = requirementsRes.value;

  // A suggestion can pull in a restricted space, which would lock out an editor that cannot read
  // it. Checked before the write so a rejected batch leaves the skill untouched.
  const editorsAccessError = await findSkillEditorsWithoutAccessToSpaceIds(
    auth,
    skill,
    requirements.requestedSpaceIds
  );
  if (editorsAccessError) {
    return new Err(new DustError("invalid_request_error", editorsAccessError));
  }

  // `updateSkill` replaces the whole skill, so every field no suggestion touched is carried over
  // from the current values.
  await skill.updateSkill(auth, {
    agentFacingDescription:
      agentFacingDescription ?? skill.agentFacingDescription,
    attachedKnowledge: requirements.attachedKnowledge,
    availability,
    icon: skill.icon,
    instructions: instructions.value?.instructions ?? skill.instructions,
    instructionsHtml:
      instructions.value?.instructionsHtml ?? skill.instructionsHtml,
    manuallyRequestedSpaceIds: skill.manuallyRequestedSpaceIds,
    mcpServerViews: requirements.mcpServerViews,
    name: name ?? skill.name,
    requestedSpaceIds: requirements.requestedSpaceIds,
    userFacingDescription: userFacingDescription ?? skill.userFacingDescription,
  });

  if (availability !== undefined && availability !== previousAvailability) {
    void emitAuditLogEvent({
      auth,
      action: "skill.availability_updated",
      targets: [
        buildAuditLogTarget("workspace", auth.getNonNullableWorkspace()),
        { type: "skill", id: skill.sId, name: skill.name },
      ],
      context: getAuditLogContext(auth),
      metadata: {
        skill_name: skill.name,
        previous_availability: previousAvailability,
        new_availability: availability,
      },
    });
  }

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

  // `updateSkill` asserts the publish capabilities whenever it receives an availability, so one is
  // only passed on when a suggestion asked for it and the value actually changes.
  if (edits.availability !== undefined) {
    const validation = await validateSkillAvailabilityChange(auth, skill, {
      availability: edits.availability,
    });
    if (validation.isErr()) {
      return new Err(
        new DustError("invalid_request_error", validation.error.message)
      );
    }
    edits = { ...edits, availability: validation.value?.availability };
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

  if (edits.archive) {
    const validation = validateSkillDeletion(auth, skill);
    if (validation.isErr()) {
      return new Err(
        new DustError("invalid_request_error", validation.error.message)
      );
    }
  }

  // TODO(achilleburah): make the editor change and skill update atomic so if editors changes fails,
  //  the skill update is rolled back.

  // `updateSkill` saves a version, so a batch that only moves editors must not call it.
  if (hasSkillFieldEdits(edits)) {
    const updateRes = await applySkillFieldEdits(auth, skill, edits);
    if (updateRes.isErr()) {
      return updateRes;
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

  // An accepted availability suggestion whose value already matches the skill still resolves
  // every other pending availability suggestion, so this prunes outside the field-write guard.
  await pruneConflictingSkillAvailabilitySuggestions(
    auth,
    skill,
    suggestions.filter(isAvailabilitySkillSuggestion)
  );

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

  // Archiving is terminal, so it runs last: any other edit in the batch is applied to the skill
  // first, exactly as if it had been accepted on its own right before the deletion.
  if (edits.archive) {
    await skill.archive(auth);
  }

  return new Ok(undefined);
}
