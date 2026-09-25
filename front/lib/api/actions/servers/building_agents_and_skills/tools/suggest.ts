import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import type { SingletonAgentSuggestionData } from "@app/lib/api/actions/servers/building_agents_and_skills/agent_suggestion_changes";
import {
  recordAgentCreationSuggestion,
  recordSingletonAgentSuggestions,
  validateAgentCreation,
  validateAgentDeletion,
  validateAgentDescriptionChange,
  validateAgentInstructionsChange,
  validateAgentModelChange,
  validateAgentNameChange,
  validateAgentPublishStateChange,
} from "@app/lib/api/actions/servers/building_agents_and_skills/agent_suggestion_changes";
import { formatBatchSuggestionDirective } from "@app/lib/api/actions/servers/building_agents_and_skills/directives";
import type {
  CreateAgentSuggestion,
  CreateSkillSuggestion,
  DeleteAgentSuggestion,
  DeleteSkillSuggestion,
  EditAgentSuggestion,
  EditSkillSuggestion,
  SuggestArgs,
  Suggestion,
} from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import {
  checkSkillSuggestionKindAuthorized,
  recordSkillCreationSuggestion,
  recordSkillSuggestions,
  validateSkillAvailabilitySuggestion,
  validateSkillCreation,
  validateSkillDeletionSuggestion,
  validateSkillEditorsSuggestion,
  validateSkillEditSuggestion,
  validateSkillNameSuggestion,
  validateSkillUserFacingDescriptionSuggestion,
} from "@app/lib/api/actions/servers/building_agents_and_skills/skill_suggestion_changes";
import type { InstructionSuggestionEditInput } from "@app/lib/api/assistant/agent_instructions_suggestions";
import { createAgentInstructionSuggestions } from "@app/lib/api/assistant/agent_instructions_suggestions";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { fetchCustomSkillById } from "@app/lib/api/skills/write_access";
import type { Authenticator } from "@app/lib/auth";
import { BatchSuggestionResource } from "@app/lib/resources/batch_suggestion_resource";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import {
  extractSkillRefs,
  hasUnparsableSkillRefTag,
} from "@app/lib/skills/format";
import type {
  AgentConfigurationType,
  LightAgentConfigurationType,
} from "@app/types/assistant/agent";
import { isGlobalAgentId } from "@app/types/assistant/assistant";
import type { ConversationType } from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { CreateSuggestionType } from "@app/types/suggestions/agent_suggestion";
import type {
  SkillCreateSuggestionType,
  SkillSuggestionData,
} from "@app/types/suggestions/skill_suggestion";
import assert from "assert";

/**
 * What one validated suggestion records. Each maps to one or more rows of the existing agent and
 * skill suggestion kinds, all attached to the same batch.
 */
type PlannedChange =
  | { type: "agent_creation"; create: CreateSuggestionType }
  | {
      type: "agent";
      agent: LightAgentConfigurationType;
      singletons: SingletonAgentSuggestionData[];
      instructions: {
        agent: AgentConfigurationType;
        edits: InstructionSuggestionEditInput[];
      } | null;
    }
  | { type: "skill_creation"; create: SkillCreateSuggestionType }
  | { type: "skill"; skill: SkillResource; rows: SkillSuggestionData[] };

async function fetchAgentForSuggestion(
  auth: Authenticator,
  agentId: string
): Promise<Result<AgentConfigurationType, MCPError>> {
  const agent = await getAgentConfiguration(auth, {
    agentId,
    variant: "full",
  });
  if (!agent || (!agent.canRead && !auth.isAdmin())) {
    return new Err(new MCPError(`Agent "${agentId}" not found.`));
  }

  // Global agents have no configuration row for a suggestion to reference.
  if (isGlobalAgentId(agent.sId)) {
    return new Err(
      new MCPError(
        `Agent "${agentId}" is a global agent: it cannot be changed.`
      )
    );
  }

  return new Ok(agent);
}

async function planAgentCreation(
  auth: Authenticator,
  { name, description, instructions }: CreateAgentSuggestion
): Promise<Result<PlannedChange, MCPError>> {
  const validation = await validateAgentCreation(auth, { name });
  if (validation.isErr()) {
    return validation;
  }

  return new Ok({
    type: "agent_creation",
    create: { name: validation.value.name, description, instructions },
  });
}

async function planSkillCreation(
  auth: Authenticator,
  {
    name,
    userFacingDescription,
    agentFacingDescription,
    instructions,
  }: CreateSkillSuggestion
): Promise<Result<PlannedChange, MCPError>> {
  const validation = await validateSkillCreation(auth, { name });
  if (validation.isErr()) {
    return validation;
  }

  return new Ok({
    type: "skill_creation",
    create: {
      name,
      userFacingDescription,
      agentFacingDescription,
      instructions,
    },
  });
}

async function planAgentEdit(
  auth: Authenticator,
  {
    agentId,
    name,
    description,
    instructionEdits,
    modelId,
    reasoningEffort,
    scope,
  }: EditAgentSuggestion
): Promise<Result<PlannedChange, MCPError>> {
  const agentRes = await fetchAgentForSuggestion(auth, agentId);
  if (agentRes.isErr()) {
    return agentRes;
  }
  const agent = agentRes.value;

  const singletons: SingletonAgentSuggestionData[] = [];

  if (name !== undefined) {
    const validation = await validateAgentNameChange(auth, agent, { name });
    if (validation.isErr()) {
      return new Err(new MCPError(validation.error.message));
    }
    singletons.push({ kind: "name", suggestion: validation.value });
  }

  if (description !== undefined) {
    const validation = validateAgentDescriptionChange(agent, { description });
    if (validation.isErr()) {
      return new Err(new MCPError(validation.error.message));
    }
    singletons.push({ kind: "description", suggestion: validation.value });
  }

  if (scope !== undefined) {
    const validation = validateAgentPublishStateChange(agent, { scope });
    if (validation.isErr()) {
      return new Err(new MCPError(validation.error.message));
    }
    singletons.push({ kind: "scope", suggestion: validation.value });
  }

  if (modelId !== undefined) {
    const validation = await validateAgentModelChange(auth, agent, {
      modelId,
      reasoningEffort,
    });
    if (validation.isErr()) {
      return validation;
    }
    singletons.push({ kind: "model", suggestion: validation.value });
  } else if (reasoningEffort !== undefined) {
    return new Err(
      new MCPError("`reasoningEffort` can only be suggested with a `modelId`.")
    );
  }

  let instructions: {
    agent: AgentConfigurationType;
    edits: InstructionSuggestionEditInput[];
  } | null = null;
  if (instructionEdits && instructionEdits.length > 0) {
    const validation = await validateAgentInstructionsChange(
      auth,
      agent,
      instructionEdits
    );
    if (validation.isErr()) {
      return validation;
    }
    instructions = { agent, edits: validation.value };
  }

  if (singletons.length === 0 && instructions === null) {
    return new Err(
      new MCPError(
        `The edit of agent "${agentId}" does not change anything: provide at least one field.`
      )
    );
  }

  return new Ok({ type: "agent", agent, singletons, instructions });
}

async function planAgentDeletion(
  auth: Authenticator,
  { agentId }: DeleteAgentSuggestion
): Promise<Result<PlannedChange, MCPError>> {
  const agentRes = await fetchAgentForSuggestion(auth, agentId);
  if (agentRes.isErr()) {
    return agentRes;
  }
  const agent = agentRes.value;

  const validation = validateAgentDeletion(auth, agent);
  if (validation.isErr()) {
    return validation;
  }

  return new Ok({
    type: "agent",
    agent,
    singletons: [{ kind: "delete", suggestion: validation.value }],
    instructions: null,
  });
}

async function fetchSkillForSuggestion(
  auth: Authenticator,
  skillId: string
): Promise<Result<SkillResource, MCPError>> {
  const skillResult = await fetchCustomSkillById(
    auth,
    skillId,
    "Only custom workspace skills can receive suggestions."
  );
  if (skillResult.isErr()) {
    return new Err(new MCPError(skillResult.error.message));
  }

  return new Ok(skillResult.value);
}

async function planSkillEdit(
  auth: Authenticator,
  {
    skillId,
    name,
    userFacingDescription,
    agentFacingDescription,
    instructionEdits,
    availability,
    addEditorUserIds,
    removeEditorUserIds,
  }: EditSkillSuggestion
): Promise<Result<PlannedChange, MCPError>> {
  const skillRes = await fetchSkillForSuggestion(auth, skillId);
  if (skillRes.isErr()) {
    return skillRes;
  }
  const skill = skillRes.value;

  const rows: SkillSuggestionData[] = [];

  if (name !== undefined) {
    const validation = await validateSkillNameSuggestion(auth, skill, {
      name,
    });
    if (validation.isErr()) {
      return validation;
    }
    rows.push({ kind: "name", suggestion: validation.value });
  }

  if (userFacingDescription !== undefined) {
    const validation = validateSkillUserFacingDescriptionSuggestion(
      auth,
      skill,
      { userFacingDescription }
    );
    if (validation.isErr()) {
      return validation;
    }
    rows.push({
      kind: "user_facing_description",
      suggestion: validation.value,
    });
  }

  if (
    (instructionEdits && instructionEdits.length > 0) ||
    agentFacingDescription !== undefined
  ) {
    const validation = validateSkillEditSuggestion(auth, skill, {
      instructionEdits,
      agentFacingDescriptionEdit:
        agentFacingDescription !== undefined
          ? { content: agentFacingDescription }
          : undefined,
    });
    if (validation.isErr()) {
      return validation;
    }
    rows.push({ kind: "edit", suggestion: validation.value });
  }

  if (availability !== undefined) {
    const validation = validateSkillAvailabilitySuggestion(auth, skill, {
      availability,
    });
    if (validation.isErr()) {
      return validation;
    }
    rows.push({ kind: "availability", suggestion: validation.value });
  }

  if (addEditorUserIds !== undefined || removeEditorUserIds !== undefined) {
    const validation = await validateSkillEditorsSuggestion(auth, skill, {
      addUserIds: addEditorUserIds ?? [],
      removeUserIds: removeEditorUserIds ?? [],
    });
    if (validation.isErr()) {
      return validation;
    }
    rows.push({ kind: "editors", suggestion: validation.value });
  }

  if (rows.length === 0) {
    return new Err(
      new MCPError(
        `The edit of skill "${skillId}" does not change anything: provide at least one field.`
      )
    );
  }

  for (const row of rows) {
    const authorized = checkSkillSuggestionKindAuthorized(auth, skill, row);
    if (authorized.isErr()) {
      return authorized;
    }
  }

  return new Ok({ type: "skill", skill, rows });
}

async function planSkillDeletion(
  auth: Authenticator,
  { skillId }: DeleteSkillSuggestion
): Promise<Result<PlannedChange, MCPError>> {
  const skillRes = await fetchSkillForSuggestion(auth, skillId);
  if (skillRes.isErr()) {
    return skillRes;
  }
  const skill = skillRes.value;

  const validation = validateSkillDeletionSuggestion(auth, skill);
  if (validation.isErr()) {
    return validation;
  }

  return new Ok({
    type: "skill",
    skill,
    rows: [{ kind: "delete", suggestion: validation.value }],
  });
}

async function planSuggestion(
  auth: Authenticator,
  suggestion: Suggestion
): Promise<Result<PlannedChange, MCPError>> {
  switch (suggestion.kind) {
    case "create_agent":
      return planAgentCreation(auth, suggestion);
    case "edit_agent":
      return planAgentEdit(auth, suggestion);
    case "delete_agent":
      return planAgentDeletion(auth, suggestion);
    case "create_skill":
      return planSkillCreation(auth, suggestion);
    case "edit_skill":
      return planSkillEdit(auth, suggestion);
    case "delete_skill":
      return planSkillDeletion(auth, suggestion);
    default:
      assertNever(suggestion);
  }
}

/** The refs the suggestions give to the skills they create. */
function skillRefsOf(suggestions: Suggestion[]): string[] {
  return suggestions.flatMap((suggestion) => {
    switch (suggestion.kind) {
      case "create_skill":
        return suggestion.ref ? [suggestion.ref] : [];
      case "edit_skill":
      case "create_agent":
      case "edit_agent":
      case "delete_agent":
      case "delete_skill":
        return [];
      default:
        assertNever(suggestion);
    }
  });
}

/** The skill instructions the suggestions write, where skill tags may use a ref. */
function skillInstructionsOf(suggestions: Suggestion[]): string[] {
  return suggestions.flatMap((suggestion) => {
    switch (suggestion.kind) {
      case "create_skill":
        return [suggestion.instructions];
      case "edit_skill":
        return (suggestion.instructionEdits ?? []).map((edit) => edit.content);
      case "create_agent":
      case "edit_agent":
        // TODO(conversational-building): collect the refs agents use once they can add skills.
        return [];
      case "delete_agent":
      case "delete_skill":
        return [];
      default:
        assertNever(suggestion);
    }
  });
}

/**
 * Checks that each ref is declared only once, by a skill creation. Every skill tag citing a ref in
 * the call's instructions must point at one of those declared refs.
 */
function validateRefs(suggestions: Suggestion[]): Result<undefined, MCPError> {
  const pendingSkillRefs = new Set<string>();
  for (const ref of skillRefsOf(suggestions)) {
    if (pendingSkillRefs.has(ref)) {
      return new Err(new MCPError(`The ref "${ref}" is declared twice.`));
    }
    pendingSkillRefs.add(ref);
  }

  for (const content of skillInstructionsOf(suggestions)) {
    if (hasUnparsableSkillRefTag(content)) {
      return new Err(
        new MCPError(
          'A skill tag citing a ref must be written as <skill ref="name"/>.'
        )
      );
    }
    // A skill tag can only use the ref of a skill created in this call: that skill gets a pending
    // skill whose id replaces the ref before storage.
    const unknownRef = extractSkillRefs(content).find(
      (ref) => !pendingSkillRefs.has(ref)
    );
    if (unknownRef) {
      return new Err(
        new MCPError(
          `The ref "${unknownRef}" is not declared by any skill creation of this call.`
        )
      );
    }
  }

  return new Ok(undefined);
}

/** Each existing agent or skill may be targeted by at most one suggestion of the batch. */
function findDuplicateTarget(suggestions: Suggestion[]): string | null {
  const seen = new Set<string>();
  for (const suggestion of suggestions) {
    let target: string | null;
    switch (suggestion.kind) {
      case "edit_agent":
      case "delete_agent":
        target = suggestion.agentId;
        break;
      case "edit_skill":
      case "delete_skill":
        target = suggestion.skillId;
        break;
      case "create_agent":
      case "create_skill":
        target = null;
        break;
      default:
        assertNever(suggestion);
    }

    if (target !== null) {
      if (seen.has(target)) {
        return target;
      }
      seen.add(target);
    }
  }

  return null;
}

async function recordPlannedChange(
  auth: Authenticator,
  change: PlannedChange,
  {
    batch,
    conversation,
  }: { batch: BatchSuggestionResource; conversation: ConversationType }
): Promise<Result<undefined, MCPError>> {
  switch (change.type) {
    case "agent_creation": {
      const res = await recordAgentCreationSuggestion(auth, {
        create: change.create,
        analysis: null,
        conversation,
        batch,
      });
      return res.isErr() ? res : new Ok(undefined);
    }

    case "agent": {
      await recordSingletonAgentSuggestions(auth, change.agent, {
        data: change.singletons,
        analysis: null,
        conversation,
        batch,
      });

      if (change.instructions) {
        const res = await createAgentInstructionSuggestions(auth, {
          agentConfiguration: change.instructions.agent,
          edits: change.instructions.edits,
          source: "conversational",
          conversation,
          batch,
        });
        if (res.isErr()) {
          return new Err(new MCPError(res.error));
        }
      }
      return new Ok(undefined);
    }

    case "skill_creation": {
      const res = await recordSkillCreationSuggestion(auth, {
        create: change.create,
        analysis: null,
        conversation,
        batch,
      });
      return res.isErr() ? res : new Ok(undefined);
    }

    case "skill": {
      await recordSkillSuggestions(auth, change.skill, {
        data: change.rows,
        analysis: null,
        title: null,
        conversation,
        batch,
      });
      return new Ok(undefined);
    }

    default:
      assertNever(change);
  }
}

/**
 * @cc [owner:fabiencelier,label:product;mcp] suggest-validates-all-before-writing
 * `suggest` MUST validate every suggestion of the call against live state before recording any of
 * them: when one suggestion is invalid or unsupported, or two suggestions target the same agent or
 * skill, or a ref is declared twice or used without being declared, the call fails and no batch,
 * placeholder agent or skill, or suggestion row is created.
 */
export async function suggest(
  auth: Authenticator,
  { title, analysis, suggestions }: SuggestArgs,
  { conversation }: { conversation: ConversationType }
): Promise<Result<BatchSuggestionResource, MCPError>> {
  if (!auth.user()) {
    return new Err(
      new MCPError("Suggesting changes requires an interactive user context.")
    );
  }

  const duplicateTarget = findDuplicateTarget(suggestions);
  if (duplicateTarget) {
    return new Err(
      new MCPError(
        `"${duplicateTarget}" is targeted by several suggestions: merge them into one.`
      )
    );
  }

  const refsValidation = validateRefs(suggestions);
  if (refsValidation.isErr()) {
    return refsValidation;
  }

  const plannedChanges: PlannedChange[] = [];
  for (const suggestion of suggestions) {
    const planned = await planSuggestion(auth, suggestion);
    if (planned.isErr()) {
      return planned;
    }
    plannedChanges.push(planned.value);
  }

  const batch = await BatchSuggestionResource.makeNew(auth, {
    title,
    analysis,
    sourceConversation: conversation,
  });

  for (const change of plannedChanges) {
    const recorded = await recordPlannedChange(auth, change, {
      batch,
      conversation,
    });
    if (recorded.isErr()) {
      const partialBatch = await BatchSuggestionResource.fetchById(
        auth,
        batch.sId
      );
      await partialBatch?.updateState(auth, "outdated");
      return recorded;
    }
  }

  const recordedBatch = await BatchSuggestionResource.fetchById(
    auth,
    batch.sId
  );
  if (!recordedBatch) {
    return new Err(new MCPError("Failed to load the recorded suggestions."));
  }

  return new Ok(recordedBatch);
}

export async function suggestHandler(
  args: SuggestArgs,
  { auth, runContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  assert(isAgentLoopRunContext(runContext), "AgentLoopRunContext expected");

  const result = await suggest(auth, args, {
    conversation: runContext.conversation,
  });
  if (result.isErr()) {
    return result;
  }

  const batch = result.value;

  return new Ok([
    {
      type: "text" as const,
      text: formatBatchSuggestionDirective(batch),
    },
  ]);
}
