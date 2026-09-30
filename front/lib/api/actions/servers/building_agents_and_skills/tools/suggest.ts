import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import type {
  KeyedAgentSuggestionData,
  SingletonAgentSuggestionData,
} from "@app/lib/api/actions/servers/building_agents_and_skills/agent_suggestion_changes";
import {
  recordAgentCreationSuggestion,
  recordKeyedAgentSuggestions,
  recordSingletonAgentSuggestions,
  validateAgentCreation,
  validateAgentCreationCapabilities,
  validateAgentDeletion,
  validateAgentDescriptionChange,
  validateAgentEditorsSuggestion,
  validateAgentInstructionsChange,
  validateAgentModelChange,
  validateAgentNameChange,
  validateAgentPublishStateChange,
  validateAgentSkillChanges,
  validateAgentStructuredOutputChange,
  validateAgentSubAgentChanges,
  validateAgentTagsSuggestion,
  validateAgentToolChanges,
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
import { fetchRunAgentTool } from "@app/lib/api/assistant/suggestable_sub_agents";
import { fetchCustomSkillById } from "@app/lib/api/skills/write_access";
import type { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { BatchSuggestionResource } from "@app/lib/resources/batch_suggestion_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillReference } from "@app/lib/skills/format";
import {
  extractSkillRefs,
  hasUnparsableSkillRefTag,
  resolveSkillRefTags,
} from "@app/lib/skills/format";
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
  | {
      type: "agent_creation";
      ref: string | null;
      create: CreateSuggestionType;
      skillRefs: string[];
    }
  | {
      type: "agent";
      agent: AgentResource;
      singletons: SingletonAgentSuggestionData[];
      instructions: {
        agent: AgentResource;
        edits: InstructionSuggestionEditInput[];
      } | null;
      keyed: KeyedAgentSuggestionData[];
      skillRefs: string[];
      subAgentRefs: string[];
    }
  | {
      type: "skill_creation";
      ref: string | null;
      create: SkillCreateSuggestionType;
    }
  | { type: "skill"; skill: SkillResource; rows: SkillSuggestionData[] };

async function fetchAgentForSuggestion(
  auth: Authenticator,
  agentId: string
): Promise<Result<AgentResource, MCPError>> {
  const agent = await AgentResource.fetchById(auth, agentId);
  if (!agent || (!auth.can("read", agent) && !auth.can("admin", agent))) {
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
  {
    ref,
    name,
    description,
    instructions,
    toolIds = [],
    skillIds = [],
    skillRefs = [],
  }: CreateAgentSuggestion
): Promise<Result<PlannedChange, MCPError>> {
  const validation = await validateAgentCreation(auth, { name });
  if (validation.isErr()) {
    return validation;
  }

  const capabilities = await validateAgentCreationCapabilities(auth, {
    toolIds,
    skillIds,
  });
  if (capabilities.isErr()) {
    return capabilities;
  }

  return new Ok({
    type: "agent_creation",
    ref: ref ?? null,
    create: {
      name: validation.value.name,
      description,
      instructions,
      toolIds,
      skillIds,
    },
    skillRefs,
  });
}

async function planSkillCreation(
  auth: Authenticator,
  {
    ref,
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
    ref: ref ?? null,
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
    structuredOutput,
    skills: skillChanges,
    tools: toolChanges,
    subAgents: subAgentChanges,
    editors: editorChanges,
    tags: tagChanges,
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
    const validation = validateAgentDescriptionChange(auth, agent, {
      description,
    });
    if (validation.isErr()) {
      return new Err(new MCPError(validation.error.message));
    }
    singletons.push({ kind: "description", suggestion: validation.value });
  }

  if (scope !== undefined) {
    const validation = validateAgentPublishStateChange(auth, agent, { scope });
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

  if (structuredOutput !== undefined) {
    // Validated against the model the agent will run, which the same edit may change.
    const validation = validateAgentStructuredOutputChange(auth, agent, {
      modelId: modelId ?? agent.modelConfiguration.modelId,
      responseFormat: structuredOutput,
    });
    if (validation.isErr()) {
      return validation;
    }
    singletons.push({
      kind: "structured_output",
      suggestion: validation.value,
    });
  }

  if (editorChanges !== undefined) {
    const validation = await validateAgentEditorsSuggestion(auth, agent, {
      addUserIds: editorChanges.addUserIds ?? [],
      removeUserIds: editorChanges.removeUserIds ?? [],
    });
    if (validation.isErr()) {
      return validation;
    }
    singletons.push({ kind: "editors", suggestion: validation.value });
  }

  if (tagChanges !== undefined) {
    const validation = await validateAgentTagsSuggestion(auth, agent, {
      addTags: tagChanges.addTags ?? [],
      removeTags: tagChanges.removeTags ?? [],
    });
    if (validation.isErr()) {
      return validation;
    }
    singletons.push({ kind: "tags", suggestion: validation.value });
  }

  let instructions: {
    agent: AgentResource;
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
    assert(
      agent.canViewContent,
      "Validated instruction edits imply a readable agent."
    );
    instructions = { agent, edits: validation.value };
  }

  const keyed: KeyedAgentSuggestionData[] = [];
  const addSkillIds = skillChanges?.addSkillIds ?? [];
  const addSkillRefs = skillChanges?.addSkillRefs ?? [];
  const removeSkillIds = skillChanges?.removeSkillIds ?? [];

  if (
    addSkillIds.length > 0 ||
    removeSkillIds.length > 0 ||
    addSkillRefs.length > 0
  ) {
    const validation = await validateAgentSkillChanges(auth, agent, {
      addSkillIds,
      removeSkillIds,
    });
    if (validation.isErr()) {
      return validation;
    }
    keyed.push(
      ...validation.value.map((suggestion) => ({
        kind: "skills" as const,
        suggestion,
      }))
    );
  }

  const addToolIds = toolChanges?.addToolIds ?? [];
  const removeToolIds = toolChanges?.removeToolIds ?? [];
  if (addToolIds.length > 0 || removeToolIds.length > 0) {
    const validation = await validateAgentToolChanges(auth, agent, {
      addToolIds,
      removeToolIds,
    });
    if (validation.isErr()) {
      return validation;
    }
    keyed.push(
      ...validation.value.map((suggestion) => ({
        kind: "tools" as const,
        suggestion,
      }))
    );
  }

  const addAgentIds = subAgentChanges?.addAgentIds ?? [];
  const addAgentRefs = subAgentChanges?.addAgentRefs ?? [];
  const removeAgentIds = subAgentChanges?.removeAgentIds ?? [];
  if (
    addAgentIds.length > 0 ||
    removeAgentIds.length > 0 ||
    addAgentRefs.length > 0
  ) {
    const validation = await validateAgentSubAgentChanges(auth, agent, {
      addAgentIds,
      removeAgentIds,
    });
    if (validation.isErr()) {
      return validation;
    }
    keyed.push(
      ...validation.value.map((suggestion) => ({
        kind: "sub_agent" as const,
        suggestion,
      }))
    );
  }

  if (
    singletons.length === 0 &&
    instructions === null &&
    keyed.length === 0 &&
    addSkillRefs.length === 0 &&
    addAgentRefs.length === 0
  ) {
    return new Err(
      new MCPError(
        `The edit of agent "${agentId}" does not change anything: provide at least one field.`
      )
    );
  }

  return new Ok({
    type: "agent",
    agent,
    singletons,
    instructions,
    keyed,
    skillRefs: addSkillRefs,
    subAgentRefs: addAgentRefs,
  });
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
    keyed: [],
    skillRefs: [],
    subAgentRefs: [],
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
        return [];
      case "delete_agent":
      case "delete_skill":
        return [];
      default:
        assertNever(suggestion);
    }
  });
}

/** The refs of skills created in the call that the suggestions give to agents. */
function agentSkillRefsOf(suggestions: Suggestion[]): string[] {
  return suggestions.flatMap((suggestion) => {
    switch (suggestion.kind) {
      case "create_agent":
        return suggestion.skillRefs ?? [];
      case "edit_agent":
        return suggestion.skills?.addSkillRefs ?? [];
      case "delete_agent":
      case "create_skill":
      case "edit_skill":
      case "delete_skill":
        return [];
      default:
        assertNever(suggestion);
    }
  });
}

/**
 * Checks that each skill ref is declared once among the skill creations, and each agent ref once
 * among the agent creations. Every skill tag citing a ref in the call's instructions, and every
 * skill ref given to an agent, must point at a declared skill ref. Every sub-agent ref must point
 * at a declared agent ref.
 */
function validateRefs(suggestions: Suggestion[]): Result<undefined, MCPError> {
  const pendingSkillRefs = new Set<string>();
  for (const ref of skillRefsOf(suggestions)) {
    if (pendingSkillRefs.has(ref)) {
      return new Err(new MCPError(`The ref "${ref}" is declared twice.`));
    }
    pendingSkillRefs.add(ref);
  }

  const declaredAgentRefs = suggestions.flatMap((suggestion) =>
    suggestion.kind === "create_agent" && suggestion.ref ? [suggestion.ref] : []
  );
  const pendingAgentRefs = new Set<string>();
  for (const ref of declaredAgentRefs) {
    if (pendingAgentRefs.has(ref)) {
      return new Err(new MCPError(`The ref "${ref}" is declared twice.`));
    }
    pendingAgentRefs.add(ref);
  }

  const subAgentRefs = suggestions.flatMap((suggestion) =>
    suggestion.kind === "edit_agent"
      ? (suggestion.subAgents?.addAgentRefs ?? [])
      : []
  );
  const unknownSubAgentRef = subAgentRefs.find(
    (ref) => !pendingAgentRefs.has(ref)
  );
  if (unknownSubAgentRef) {
    return new Err(
      new MCPError(
        `The ref "${unknownSubAgentRef}" is not declared by any agent creation of this call.`
      )
    );
  }

  const unknownAgentSkillRef = agentSkillRefsOf(suggestions).find(
    (ref) => !pendingSkillRefs.has(ref)
  );
  if (unknownAgentSkillRef) {
    return new Err(
      new MCPError(
        `The ref "${unknownAgentSkillRef}" is not declared by any skill creation of this call.`
      )
    );
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

/** The skills a suggestion gives to an agent, whether it creates or edits it. */
function addedSkillIdsOf(suggestion: Suggestion): string[] {
  switch (suggestion.kind) {
    case "create_agent":
      return suggestion.skillIds ?? [];
    case "edit_agent":
      return suggestion.skills?.addSkillIds ?? [];
    case "delete_agent":
    case "create_skill":
    case "edit_skill":
    case "delete_skill":
      return [];
    default:
      assertNever(suggestion);
  }
}

/** A skill the batch deletes cannot also be added to an agent by the same batch. */
function findSkillAddedAndDeleted(suggestions: Suggestion[]): string | null {
  const deletedSkillIds = new Set(
    suggestions.flatMap((suggestion) =>
      suggestion.kind === "delete_skill" ? [suggestion.skillId] : []
    )
  );
  for (const suggestion of suggestions) {
    const addedSkillId = addedSkillIdsOf(suggestion).find((id) =>
      deletedSkillIds.has(id)
    );
    if (addedSkillId) {
      return addedSkillId;
    }
  }
  return null;
}

/** An agent the batch deletes cannot also be added as a sub-agent by the same batch. */
function findSubAgentAddedAndDeleted(suggestions: Suggestion[]): string | null {
  const deletedAgentIds = new Set(
    suggestions.flatMap((suggestion) =>
      suggestion.kind === "delete_agent" ? [suggestion.agentId] : []
    )
  );
  for (const suggestion of suggestions) {
    if (suggestion.kind === "edit_agent") {
      const addedAgentId = (suggestion.subAgents?.addAgentIds ?? []).find(
        (id) => deletedAgentIds.has(id)
      );
      if (addedAgentId) {
        return addedAgentId;
      }
    }
  }
  return null;
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

/**
 * Creates the pending skill of each skill creation, before any row is written, so that a skill tag
 * using the ref of one can be rewritten with its id, whatever the order of the suggestions.
 */
async function createPendingSkills(
  auth: Authenticator,
  changes: PlannedChange[]
): Promise<
  Result<
    {
      pendingSkillByChange: Map<PlannedChange, SkillResource>;
      skillReferenceByRef: Map<string, SkillReference>;
    },
    MCPError
  >
> {
  const skillCreations = changes.filter(
    (change): change is Extract<PlannedChange, { type: "skill_creation" }> =>
      change.type === "skill_creation"
  );
  const pendingSkills = await SkillResource.createPendings(
    auth,
    skillCreations.length
  );
  if (pendingSkills.isErr()) {
    return new Err(new MCPError(pendingSkills.error.message));
  }

  const pendingSkillByChange = new Map<PlannedChange, SkillResource>();
  const skillReferenceByRef = new Map<string, SkillReference>();
  skillCreations.forEach((change, i) => {
    const pendingSkill = pendingSkills.value[i];
    pendingSkillByChange.set(change, pendingSkill);
    if (change.ref) {
      skillReferenceByRef.set(change.ref, {
        id: pendingSkill.sId,
        name: change.create.name,
        icon: null,
      });
    }
  });

  return new Ok({ pendingSkillByChange, skillReferenceByRef });
}

/**
 * Creates the pending agent of each agent creation, before any row is written, so that a sub-agent
 * added by the ref of one can be recorded with its id, whatever the order of the suggestions.
 */
async function createPendingAgents(
  auth: Authenticator,
  changes: PlannedChange[]
): Promise<
  Result<
    {
      pendingAgentByChange: Map<PlannedChange, AgentResource>;
      agentIdByRef: Map<string, string>;
    },
    MCPError
  >
> {
  const agentCreations = changes.filter(
    (change): change is Extract<PlannedChange, { type: "agent_creation" }> =>
      change.type === "agent_creation"
  );
  const pendingAgents = await AgentResource.createPendings(
    auth,
    agentCreations.map((change) => change.create.name)
  );
  if (pendingAgents.isErr()) {
    return new Err(new MCPError(pendingAgents.error.message));
  }

  const pendingAgentByChange = new Map<PlannedChange, AgentResource>();
  const agentIdByRef = new Map<string, string>();
  agentCreations.forEach((change, i) => {
    const pendingAgent = pendingAgents.value[i];
    pendingAgentByChange.set(change, pendingAgent);
    if (change.ref) {
      agentIdByRef.set(change.ref, pendingAgent.sId);
    }
  });

  return new Ok({ pendingAgentByChange, agentIdByRef });
}

function resolvePendingAgentId(
  ref: string,
  agentIdByRef: Map<string, string>
): string {
  const agentId = agentIdByRef.get(ref);
  assert(agentId, "Refs are validated before any row is recorded.");

  return agentId;
}

function resolveRunAgentToolId(runAgentToolId: string | null): string {
  assert(
    runAgentToolId,
    "suggest checks the run_agent tool before any row is recorded."
  );

  return runAgentToolId;
}

function resolvePendingSkillId(
  ref: string,
  skillReferenceByRef: Map<string, SkillReference>
): string {
  const reference = skillReferenceByRef.get(ref);
  assert(reference, "Refs are validated before any row is recorded.");

  return reference.id;
}

function resolveSkillRow(
  row: SkillSuggestionData,
  skillReferenceByRef: Map<string, SkillReference>
): SkillSuggestionData {
  switch (row.kind) {
    case "edit":
      return {
        kind: "edit",
        suggestion: {
          ...row.suggestion,
          instructionEdits: row.suggestion.instructionEdits?.map((edit) => ({
            ...edit,
            content: resolveSkillRefTags(edit.content, skillReferenceByRef),
          })),
        },
      };
    case "editors":
    case "user_facing_description":
    case "create":
    case "name":
    case "delete":
    case "availability":
      return row;
    default:
      assertNever(row);
  }
}

async function recordPlannedChange(
  auth: Authenticator,
  change: PlannedChange,
  {
    batch,
    conversation,
    pendingSkillByChange,
    skillReferenceByRef,
    pendingAgentByChange,
    agentIdByRef,
    runAgentToolId,
  }: {
    batch: BatchSuggestionResource;
    conversation: ConversationType;
    pendingSkillByChange: Map<PlannedChange, SkillResource>;
    skillReferenceByRef: Map<string, SkillReference>;
    pendingAgentByChange: Map<PlannedChange, AgentResource>;
    agentIdByRef: Map<string, string>;
    runAgentToolId: string | null;
  }
): Promise<Result<undefined, MCPError>> {
  switch (change.type) {
    case "agent_creation": {
      const pendingAgent = pendingAgentByChange.get(change);
      assert(pendingAgent, "Missing pending agent.");
      await recordAgentCreationSuggestion(auth, pendingAgent, {
        create: {
          ...change.create,
          skillIds: [
            ...(change.create.skillIds ?? []),
            ...change.skillRefs.map((ref) =>
              resolvePendingSkillId(ref, skillReferenceByRef)
            ),
          ],
        },
        analysis: null,
        conversation,
        batch,
      });
      return new Ok(undefined);
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
          agent: change.instructions.agent,
          edits: change.instructions.edits,
          source: "conversational",
          conversation,
          batch,
        });
        if (res.isErr()) {
          return new Err(new MCPError(res.error));
        }
      }

      await recordKeyedAgentSuggestions(auth, change.agent, {
        data: [
          ...change.keyed,
          ...change.skillRefs.map((ref) => ({
            kind: "skills" as const,
            suggestion: {
              action: "add" as const,
              skillId: resolvePendingSkillId(ref, skillReferenceByRef),
            },
          })),
          ...change.subAgentRefs.map((ref) => ({
            kind: "sub_agent" as const,
            suggestion: {
              action: "add" as const,
              toolId: resolveRunAgentToolId(runAgentToolId),
              childAgentId: resolvePendingAgentId(ref, agentIdByRef),
            },
          })),
        ],
        conversation,
        batch,
      });
      return new Ok(undefined);
    }

    case "skill_creation": {
      const pendingSkill = pendingSkillByChange.get(change);
      assert(pendingSkill, "Missing pending skill.");
      await recordSkillCreationSuggestion(auth, pendingSkill, {
        create: {
          ...change.create,
          instructions: resolveSkillRefTags(
            change.create.instructions,
            skillReferenceByRef
          ),
        },
        analysis: null,
        conversation,
        batch,
      });
      return new Ok(undefined);
    }

    case "skill": {
      await recordSkillSuggestions(auth, change.skill, {
        data: change.rows.map((row) =>
          resolveSkillRow(row, skillReferenceByRef)
        ),
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
 * skill, or a skill is both deleted and added to an agent, or an agent is both deleted and added
 * as a sub-agent, or a skill ref or agent ref is declared twice among the creations of its kind or
 * used without being declared, the call fails and no batch, placeholder agent or skill, or
 * suggestion row is created. A skill and an agent may share a ref, as each is only resolved among
 * the refs of its own kind.
 */
/**
 * @cc [owner:achilleburah,label:product;mcp] refs-resolved-before-storage
 * Every ref used by a `suggest` call MUST be rewritten to the id of the pending skill or agent of
 * the creation that declares it before any suggestion row is stored: all pending skills and agents
 * are created first, then rows are written with real ids only. No stored row holds a ref.
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

  const addedAndDeletedSkillId = findSkillAddedAndDeleted(suggestions);
  if (addedAndDeletedSkillId) {
    return new Err(
      new MCPError(
        `Skill "${addedAndDeletedSkillId}" is both deleted and added to an agent: keep only one.`
      )
    );
  }

  const addedAndDeletedSubAgentId = findSubAgentAddedAndDeleted(suggestions);
  if (addedAndDeletedSubAgentId) {
    return new Err(
      new MCPError(
        `Agent "${addedAndDeletedSubAgentId}" is both deleted and added as a sub-agent: keep only one.`
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

  const hasSubAgentRefs = plannedChanges.some(
    (change) => change.type === "agent" && change.subAgentRefs.length > 0
  );
  const runAgentTool = hasSubAgentRefs ? await fetchRunAgentTool(auth) : null;
  if (hasSubAgentRefs && !runAgentTool) {
    return new Err(
      new MCPError("The tool to run sub-agents is not available.")
    );
  }

  const batch = await BatchSuggestionResource.makeNew(auth, {
    title,
    analysis,
    sourceConversation: conversation,
  });

  const pendingSkills = await createPendingSkills(auth, plannedChanges);
  if (pendingSkills.isErr()) {
    await batch.updateState(auth, "outdated");
    return pendingSkills;
  }

  const pendingAgents = await createPendingAgents(auth, plannedChanges);
  if (pendingAgents.isErr()) {
    await batch.updateState(auth, "outdated");
    return pendingAgents;
  }

  for (const change of plannedChanges) {
    const recorded = await recordPlannedChange(auth, change, {
      batch,
      conversation,
      ...pendingSkills.value,
      ...pendingAgents.value,
      runAgentToolId: runAgentTool?.sId ?? null,
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
