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
import { findSkillEditorsWithoutSpaceAccess } from "@app/lib/api/skills/space_requirements";
import type { Authenticator } from "@app/lib/auth";
import type { SkillEdits } from "@app/lib/editor/merge_skill_suggestion_edits";
import { mergeSkillSuggestionEdits } from "@app/lib/editor/merge_skill_suggestion_edits";
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
import type {
  SkillAttachedKnowledge,
  UpdateSkillParams,
} from "@app/lib/resources/skill/skill_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillSuggestionResource } from "@app/lib/resources/skill_suggestion_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { extractToolTags } from "@app/lib/tools/format";
import type { SkillAvailability } from "@app/types/assistant/skill_configuration_constants";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { removeNulls } from "@app/types/shared/utils/general";
import { INSTRUCTIONS_ROOT_TARGET_BLOCK_ID } from "@app/types/suggestions/agent_suggestion";
import type { SkillInstructionEditItemType } from "@app/types/suggestions/skill_suggestion";
import {
  getSkillSuggestionAction,
  isAvailabilitySkillSuggestion,
  isEditorsSkillSuggestion,
  isNameSkillSuggestion,
  isUserFacingDescriptionSkillSuggestion,
  SkillSuggestionDataSchema,
} from "@app/types/suggestions/skill_suggestion";
import uniq from "lodash/uniq";
import uniqBy from "lodash/uniqBy";

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
    mcpServerViews.filter((v) => auth.can("read", v)).map((v) => v.sId)
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
      .filter((dsv) => auth.can("read", dsv))
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
 * A change resolved against the current state of its skill: every check has passed and the writes
 * are fully computed.
 */
export type ResolvedSkillChange =
  | { type: "create"; skillId: string; update: SkillUpdate }
  | {
      type: "edit";
      skillId: string;
      update: SkillUpdate | null;
      availability: SkillAvailability | null;
      editorsChange: SkillEditorsChange | null;
    }
  | { type: "delete"; skillId: string };

/**
 * The `updateSkill` params, except the requested spaces: they depend on the skills the instructions
 * reference, which the steps of a batch written before this one can change, so they are computed
 * right before the write.
 */
type SkillUpdate = Omit<UpdateSkillParams, "requestedSpaceIds">;

async function resolveSkillFieldEdits(
  auth: Authenticator,
  skill: SkillResource,
  {
    agentFacingDescription,
    userFacingDescription,
    name,
    instructionEdits,
  }: SkillEdits
): Promise<Result<SkillUpdate, DustError<"invalid_request_error">>> {
  let resolvedName = skill.name;
  if (name !== undefined) {
    const validation = await validateSkillNameChange(auth, skill, { name });
    if (validation.isErr()) {
      return new Err(
        new DustError("invalid_request_error", validation.error.message)
      );
    }
    resolvedName = validation.value.name;
  }

  const instructions = resolveInstructions(skill, instructionEdits);
  if (instructions.isErr()) {
    return instructions;
  }

  // A batch that does not change the instructions keeps the attachments it already has: nothing it
  // changed can add or drop a reference.
  const attachmentsRes = instructions.value
    ? await resolveInstructionAttachments(auth, instructions.value.instructions)
    : new Ok({
        attachedKnowledge: await skill.getAttachedKnowledge(auth),
        mcpServerViews: skill.mcpServerViews,
      });
  if (attachmentsRes.isErr()) {
    return attachmentsRes;
  }
  const attachments = attachmentsRes.value;

  // `updateSkill` replaces the whole skill, so every field no suggestion touched is carried over
  // from the current values.
  return new Ok({
    agentFacingDescription:
      agentFacingDescription ?? skill.agentFacingDescription,
    attachedKnowledge: attachments.attachedKnowledge,
    icon: skill.icon,
    instructions: instructions.value?.instructions ?? skill.instructions,
    instructionsHtml:
      instructions.value?.instructionsHtml ?? skill.instructionsHtml,
    manuallyRequestedSpaceIds: skill.manuallyRequestedSpaceIds,
    mcpServerViews: attachments.mcpServerViews,
    name: resolvedName,
    userFacingDescription: userFacingDescription ?? skill.userFacingDescription,
  });
}

/**
 * Availability goes through `updateAvailabilities`, not `updateSkill`: changing it requires `admin`
 * on the skill and the `publish` capability, not `write`.
 */
async function writeAvailabilityChange(
  auth: Authenticator,
  skill: SkillResource,
  availability: SkillAvailability
): Promise<void> {
  const previousAvailability = skill.availability;
  await SkillResource.updateAvailabilities(auth, [skill], availability);

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

// Adding before removing to prevent orphaning the skill
async function writeEditorsChange(
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

async function resolveSkillEdits(
  auth: Authenticator,
  skill: SkillResource,
  suggestions: SkillSuggestionResource[]
): Promise<Result<ResolvedSkillChange, DustError<"invalid_request_error">>> {
  const mergedEdits = mergeSkillSuggestionEdits(suggestions);
  if (mergedEdits.isErr()) {
    return mergedEdits;
  }

  const edits = mergedEdits.value;

  // `updateSkill` saves a version, so a change that only moves availability or editors must not
  // call it.
  let update: SkillUpdate | null = null;
  if (hasSkillFieldEdits(edits)) {
    const updateRes = await resolveSkillFieldEdits(auth, skill, edits);
    if (updateRes.isErr()) {
      return updateRes;
    }
    update = updateRes.value;
  }

  // `updateAvailabilities` asserts the publish capabilities, so an availability is only applied
  // when a suggestion asked for it and the value actually changes.
  let availability: SkillAvailability | null = null;
  if (edits.availability !== undefined) {
    const validation = validateSkillAvailabilityChange(auth, skill, {
      availability: edits.availability,
    });
    if (validation.isErr()) {
      return new Err(
        new DustError("invalid_request_error", validation.error.message)
      );
    }
    availability = validation.value?.availability ?? null;
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

  return new Ok({
    type: "edit",
    skillId: skill.sId,
    update,
    availability,
    editorsChange,
  });
}

async function resolveSkillCreation(
  auth: Authenticator,
  skill: SkillResource,
  suggestions: SkillSuggestionResource[]
): Promise<Result<ResolvedSkillChange, DustError<"invalid_request_error">>> {
  if (skill.status !== "pending") {
    return new Err(
      new DustError(
        "invalid_request_error",
        "The skill this suggestion targets has already been created."
      )
    );
  }

  const [suggestion] = suggestions;
  const parsed = SkillSuggestionDataSchema.safeParse({
    kind: suggestion.kind,
    suggestion: suggestion.suggestion,
  });
  if (
    suggestions.length > 1 ||
    !parsed.success ||
    parsed.data.kind !== "create"
  ) {
    return new Err(
      new DustError(
        "invalid_request_error",
        "A skill is created from a single valid create suggestion."
      )
    );
  }
  const { name, userFacingDescription, agentFacingDescription, instructions } =
    parsed.data.suggestion;

  // The placeholder is empty, so the suggested skill is resolved as an edit of every field: the
  // instructions are HTML and replace the whole (empty) document.
  const update = await resolveSkillFieldEdits(auth, skill, {
    name,
    userFacingDescription,
    agentFacingDescription,
    instructionEdits: [
      {
        targetBlockId: INSTRUCTIONS_ROOT_TARGET_BLOCK_ID,
        content: instructions,
        type: "replace",
      },
    ],
  });
  if (update.isErr()) {
    return update;
  }

  return new Ok({
    type: "create",
    skillId: skill.sId,
    update: { ...update.value, status: "active" },
  });
}

function resolveSkillDeletion(
  auth: Authenticator,
  skill: SkillResource
): Result<ResolvedSkillChange, DustError<"invalid_request_error">> {
  const validation = validateSkillDeletion(auth, skill);
  if (validation.isErr()) {
    return new Err(
      new DustError("invalid_request_error", validation.error.message)
    );
  }

  return new Ok({ type: "delete", skillId: skill.sId });
}

export async function resolveSkillSuggestions(
  auth: Authenticator,
  {
    skill,
    suggestions,
  }: { skill: SkillResource; suggestions: SkillSuggestionResource[] }
): Promise<Result<ResolvedSkillChange, DustError<"invalid_request_error">>> {
  const actions = new Set(
    suggestions.map((suggestion) => getSkillSuggestionAction(suggestion.kind))
  );
  const [action] = actions;
  if (!action || actions.size > 1) {
    return new Err(
      new DustError(
        "invalid_request_error",
        "Suggestions applied together must all create, edit or delete the skill."
      )
    );
  }

  switch (action) {
    case "create":
      return resolveSkillCreation(auth, skill, suggestions);
    case "edit":
      return resolveSkillEdits(auth, skill, suggestions);
    case "delete":
      return resolveSkillDeletion(auth, skill);
    default:
      return assertNever(action);
  }
}

/**
 * The editors the change leaves on the skill who cannot read one of `requestedSpaceIds`. Checked
 * against the final editors: an editor added by the same change as a restricted space must be able
 * to read it too.
 */
async function findEditorsWithoutAccess(
  auth: Authenticator,
  skill: SkillResource,
  {
    requestedSpaceIds,
    editorsChange,
  }: {
    requestedSpaceIds: ModelId[];
    editorsChange: SkillEditorsChange | null;
  }
): Promise<string | null> {
  const removedUserIds = new Set(
    editorsChange?.usersToRemove.map((user) => user.sId)
  );
  const editors = [
    ...((await skill.listEditors(auth)) ?? []),
    auth.getNonNullableUser(),
    ...(editorsChange?.usersToAdd ?? []),
  ].filter((user) => !removedUserIds.has(user.sId));

  return findSkillEditorsWithoutSpaceAccess(auth, {
    editors: uniqBy(editors, "id"),
    requestedSpaces: await SpaceResource.fetchByModelIds(
      auth,
      requestedSpaceIds
    ),
  });
}

export async function writeSkillChange(
  auth: Authenticator,
  skill: SkillResource,
  change: ResolvedSkillChange
): Promise<Result<undefined, DustError<"invalid_request_error">>> {
  switch (change.type) {
    case "create": {
      const { update } = change;
      const requestedSpaceIds = await SkillResource.computeRequestedSpaceIds(
        auth,
        {
          attachedKnowledge: update.attachedKnowledge,
          excludedSkillId: skill.sId,
          instructions: update.instructions,
          manuallyRequestedSpaceIds: update.manuallyRequestedSpaceIds,
          mcpServerViews: update.mcpServerViews,
        }
      );

      await skill.updateSkill(auth, { ...update, requestedSpaceIds });
      return new Ok(undefined);
    }
    case "edit": {
      const { update, availability, editorsChange } = change;
      // Computed at write time, from the referenced skills as stored now, so they account for what
      // the steps of a batch written before this one changed.
      const requestedSpaceIds = update
        ? await SkillResource.computeRequestedSpaceIds(auth, {
            attachedKnowledge: update.attachedKnowledge,
            excludedSkillId: skill.sId,
            instructions: update.instructions,
            manuallyRequestedSpaceIds: update.manuallyRequestedSpaceIds,
            mcpServerViews: update.mcpServerViews,
          })
        : skill.requestedSpaceIds;

      // A suggestion can pull in a restricted space, or add an editor, which would leave an editor
      // unable to read the skill. Checked before any write so the skill is left untouched.
      if (update || editorsChange) {
        const editorsAccessError = await findEditorsWithoutAccess(auth, skill, {
          requestedSpaceIds,
          editorsChange,
        });
        if (editorsAccessError) {
          return new Err(
            new DustError("invalid_request_error", editorsAccessError)
          );
        }
      }

      // TODO(achilleburah): make the editor change and skill update atomic so if editors changes
      //  fails, the skill update is rolled back.
      if (update) {
        await skill.updateSkill(auth, { ...update, requestedSpaceIds });
      }
      if (availability) {
        await writeAvailabilityChange(auth, skill, availability);
      }
      if (editorsChange) {
        return writeEditorsChange(auth, skill, editorsChange);
      }
      return new Ok(undefined);
    }
    case "delete":
      await skill.archive(auth);
      return new Ok(undefined);
    default:
      return assertNever(change);
  }
}

/** Marks outdated the pending suggestions that the applied `suggestions` conflict with. */
async function pruneConflictingSkillSuggestions(
  auth: Authenticator,
  skill: SkillResource,
  suggestions: SkillSuggestionResource[]
): Promise<void> {
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
  // An accepted availability suggestion whose value already matches the skill still resolves
  // every other pending availability suggestion.
  await pruneConflictingSkillAvailabilitySuggestions(
    auth,
    skill,
    suggestions.filter(isAvailabilitySkillSuggestion)
  );
  await pruneConflictingSkillEditorsSuggestions(
    auth,
    skill,
    suggestions.filter(isEditorsSkillSuggestion)
  );
}

export async function applySkillSuggestions(
  auth: Authenticator,
  params: { skill: SkillResource; suggestions: SkillSuggestionResource[] }
): Promise<Result<undefined, DustError<"invalid_request_error">>> {
  const change = await resolveSkillSuggestions(auth, params);
  if (change.isErr()) {
    return change;
  }

  const writeRes = await writeSkillChange(auth, params.skill, change.value);
  if (writeRes.isErr()) {
    return writeRes;
  }

  await pruneConflictingSkillSuggestions(
    auth,
    params.skill,
    params.suggestions
  );

  return new Ok(undefined);
}
