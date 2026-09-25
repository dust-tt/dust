import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import type {
  AgentLinkSuggestionData,
  SingletonAgentSuggestionData,
} from "@app/lib/api/actions/servers/building_agents_and_skills/agent_suggestion_changes";
import {
  createPendingAgentForSuggestion,
  recordAgentCreationSuggestionOnPlaceholder,
  recordAgentLinkSuggestions,
  recordSingletonAgentSuggestions,
  validateAgentCreation,
  validateAgentDeletion,
  validateAgentDescriptionChange,
  validateAgentInstructionsChange,
  validateAgentLinksChange,
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
  SkillTarget,
  SubAgentTarget,
  SuggestArgs,
  Suggestion,
} from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import {
  checkSkillSuggestionKindAuthorized,
  recordSkillCreationSuggestionOnPlaceholder,
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
import {
  getAgentConfiguration,
  getAgentConfigurations,
} from "@app/lib/api/assistant/configuration/agent";
import { fetchCustomSkillById } from "@app/lib/api/skills/write_access";
import type { Authenticator } from "@app/lib/auth";
import { BatchSuggestionResource } from "@app/lib/resources/batch_suggestion_resource";
import { MCPServerViewResource } from "@app/lib/resources/mcp_server_view_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { SkillReference } from "@app/lib/skills/format";
import { extractSkillRefs, resolveSkillRefTags } from "@app/lib/skills/format";
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
import uniq from "lodash/uniq";

/**
 * What one validated suggestion records. Each maps to one or more rows of the existing agent and
 * skill suggestion kinds, all attached to the same batch.
 */
type PlannedChange =
  | {
      type: "agent_creation";
      ref: string | null;
      create: CreateSuggestionType;
      skills: SkillTarget[];
      subAgents: SubAgentTarget[];
    }
  | {
      type: "agent";
      agent: LightAgentConfigurationType;
      singletons: SingletonAgentSuggestionData[];
      instructions: {
        agent: AgentConfigurationType;
        edits: InstructionSuggestionEditInput[];
      } | null;
      links: AgentLinkChanges | null;
    }
  | {
      type: "skill_creation";
      ref: string | null;
      create: SkillCreateSuggestionType;
    }
  | { type: "skill"; skill: SkillResource; rows: SkillSuggestionData[] };

type AgentLinkChanges = {
  addSkills: SkillTarget[];
  removeSkillIds: string[];
  addSubAgents: SubAgentTarget[];
  removeSubAgentIds: string[];
};

/** The placeholders created for the creations of a call, and the refs they resolve. */
type Placeholders = {
  agents: Map<PlannedChange, LightAgentConfigurationType>;
  skills: Map<PlannedChange, SkillResource>;
  agentRefs: Map<string, string>;
  skillRefs: Map<string, SkillReference>;
};

function refsOf(targets: (SkillTarget | SubAgentTarget)[]): string[] {
  return targets.flatMap((t) => ("ref" in t ? [t.ref] : []));
}

function skillIdsOf(targets: SkillTarget[]): string[] {
  return targets.flatMap((t) => ("skillId" in t ? [t.skillId] : []));
}

function agentIdsOf(targets: SubAgentTarget[]): string[] {
  return targets.flatMap((t) => ("agentId" in t ? [t.agentId] : []));
}

/** The skills and sub-agents a suggestion attaches, as existing ids or refs. */
function linkTargetsOf(suggestion: Suggestion): {
  skills: SkillTarget[];
  subAgents: SubAgentTarget[];
} {
  switch (suggestion.kind) {
    case "create_agent":
      return {
        skills: suggestion.skills ?? [],
        subAgents: suggestion.subAgents ?? [],
      };
    case "edit_agent":
      return {
        skills: suggestion.addSkills ?? [],
        subAgents: suggestion.addSubAgents ?? [],
      };
    case "create_skill":
    case "edit_skill":
    case "delete_agent":
    case "delete_skill":
      return { skills: [], subAgents: [] };
    default:
      assertNever(suggestion);
  }
}

/** The skill instructions HTML a suggestion writes, where skill tags may cite refs. */
function skillInstructionsOf(suggestion: Suggestion): string[] {
  switch (suggestion.kind) {
    case "create_skill":
      return [suggestion.instructions];
    case "edit_skill":
      return (suggestion.instructionEdits ?? []).map((edit) => edit.content);
    case "create_agent":
    case "edit_agent":
    case "delete_agent":
    case "delete_skill":
      return [];
    default:
      assertNever(suggestion);
  }
}

function declaredRefOf(
  suggestion: Suggestion
): { ref: string; kind: "agent" | "skill" } | null {
  switch (suggestion.kind) {
    case "create_agent":
      return suggestion.ref ? { ref: suggestion.ref, kind: "agent" } : null;
    case "create_skill":
      return suggestion.ref ? { ref: suggestion.ref, kind: "skill" } : null;
    case "edit_agent":
    case "edit_skill":
    case "delete_agent":
    case "delete_skill":
      return null;
    default:
      assertNever(suggestion);
  }
}

/**
 * Refs are unique within the call, every cited ref is declared by a creation of the right kind
 * (a skill where a skill is expected, an agent where a sub-agent is expected), no list cites the
 * same entity twice, and a new agent does not list itself as a sub-agent.
 */
function validateRefs(suggestions: Suggestion[]): Result<undefined, MCPError> {
  const declared = new Map<string, "agent" | "skill">();
  for (const suggestion of suggestions) {
    const declaration = declaredRefOf(suggestion);
    if (declaration) {
      if (declared.has(declaration.ref)) {
        return new Err(
          new MCPError(`The ref "${declaration.ref}" is declared twice.`)
        );
      }
      declared.set(declaration.ref, declaration.kind);
    }
  }

  for (const suggestion of suggestions) {
    const { skills, subAgents } = linkTargetsOf(suggestion);
    const cited = [
      ...refsOf(skills).map((ref) => ({ ref, kind: "skill" as const })),
      ...skillInstructionsOf(suggestion)
        .flatMap(extractSkillRefs)
        .map((ref) => ({ ref, kind: "skill" as const })),
      ...refsOf(subAgents).map((ref) => ({ ref, kind: "agent" as const })),
    ];
    for (const { ref, kind } of cited) {
      const declaredKind = declared.get(ref);
      if (!declaredKind) {
        return new Err(
          new MCPError(
            `The ref "${ref}" is not declared by any creation of this call.`
          )
        );
      }
      if (declaredKind !== kind) {
        return new Err(
          new MCPError(
            `The ref "${ref}" does not point at ${kind === "agent" ? "an agent" : "a skill"}.`
          )
        );
      }
    }

    const selfRef = declaredRefOf(suggestion);
    if (selfRef && refsOf(subAgents).includes(selfRef.ref)) {
      return new Err(new MCPError("An agent cannot be its own sub-agent."));
    }

    for (const keys of [
      skills.map((t) => ("ref" in t ? `ref:${t.ref}` : t.skillId)),
      subAgents.map((t) => ("ref" in t ? `ref:${t.ref}` : t.agentId)),
    ]) {
      if (uniq(keys).length !== keys.length) {
        return new Err(
          new MCPError(
            "A skill or sub-agent is listed twice in the same change."
          )
        );
      }
    }
  }

  return new Ok(undefined);
}

/** Existing skills and sub-agents cited by the call exist and are readable by the caller. */
async function validateExistingLinkTargets(
  auth: Authenticator,
  suggestions: Suggestion[]
): Promise<Result<undefined, MCPError>> {
  const targets = suggestions.map(linkTargetsOf);
  const skillIds = uniq(targets.flatMap((t) => skillIdsOf(t.skills)));
  const agentIds = uniq(targets.flatMap((t) => agentIdsOf(t.subAgents)));

  if (skillIds.length > 0) {
    const skills = await SkillResource.fetchByIds(auth, skillIds, {
      onlyActive: true,
      withInstructions: false,
      withTools: false,
      withFileAttachments: false,
    });
    const found = new Set(skills.map((s) => s.sId));
    const missing = skillIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      return new Err(
        new MCPError(`These skills were not found: ${missing.join(", ")}.`)
      );
    }
  }

  const globalAgentIds = agentIds.filter(isGlobalAgentId);
  if (globalAgentIds.length > 0) {
    return new Err(
      new MCPError(
        `Global agents cannot be sub-agents: ${globalAgentIds.join(", ")}.`
      )
    );
  }

  if (agentIds.length > 0) {
    const agents = await getAgentConfigurations(auth, {
      agentIds,
      variant: "light",
    });
    const found = new Set(agents.filter((a) => a.canRead).map((a) => a.sId));
    const missing = agentIds.filter((id) => !found.has(id));
    if (missing.length > 0) {
      return new Err(
        new MCPError(`These agents were not found: ${missing.join(", ")}.`)
      );
    }
  }

  return new Ok(undefined);
}

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
  {
    ref,
    name,
    description,
    instructions,
    skills,
    subAgents,
  }: CreateAgentSuggestion
): Promise<Result<PlannedChange, MCPError>> {
  const validation = await validateAgentCreation(auth, { name });
  if (validation.isErr()) {
    return validation;
  }

  return new Ok({
    type: "agent_creation",
    ref: ref ?? null,
    create: { name: validation.value.name, description, instructions },
    skills: skills ?? [],
    subAgents: subAgents ?? [],
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
    addSkills = [],
    removeSkillIds = [],
    addSubAgents = [],
    removeSubAgentIds = [],
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

  let links: AgentLinkChanges | null = null;
  if (
    addSkills.length +
      removeSkillIds.length +
      addSubAgents.length +
      removeSubAgentIds.length >
    0
  ) {
    const validation = await validateAgentLinksChange(auth, agent, {
      addSkillIds: skillIdsOf(addSkills),
      addSkillRefCount: refsOf(addSkills).length,
      removeSkillIds,
      addSubAgentIds: agentIdsOf(addSubAgents),
      addSubAgentRefCount: refsOf(addSubAgents).length,
      removeSubAgentIds,
    });
    if (validation.isErr()) {
      return validation;
    }
    links = { addSkills, removeSkillIds, addSubAgents, removeSubAgentIds };
  }

  if (singletons.length === 0 && instructions === null && links === null) {
    return new Err(
      new MCPError(
        `The edit of agent "${agentId}" does not change anything: provide at least one field.`
      )
    );
  }

  return new Ok({ type: "agent", agent, singletons, instructions, links });
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
    links: null,
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

async function createPlaceholders(
  auth: Authenticator,
  changes: PlannedChange[]
): Promise<Result<Placeholders, MCPError>> {
  const placeholders: Placeholders = {
    agents: new Map(),
    skills: new Map(),
    agentRefs: new Map(),
    skillRefs: new Map(),
  };

  for (const change of changes) {
    switch (change.type) {
      case "agent_creation": {
        const pendingAgent = await createPendingAgentForSuggestion(auth);
        if (pendingAgent.isErr()) {
          return pendingAgent;
        }
        placeholders.agents.set(change, pendingAgent.value);
        if (change.ref) {
          placeholders.agentRefs.set(change.ref, pendingAgent.value.sId);
        }
        break;
      }
      case "skill_creation": {
        const pendingSkill = await SkillResource.createPending(auth);
        if (pendingSkill.isErr()) {
          return new Err(new MCPError(pendingSkill.error.message));
        }
        placeholders.skills.set(change, pendingSkill.value);
        if (change.ref) {
          placeholders.skillRefs.set(change.ref, {
            id: pendingSkill.value.sId,
            name: change.create.name,
            icon: null,
          });
        }
        break;
      }
      case "agent":
      case "skill":
        break;
      default:
        assertNever(change);
    }
  }

  return new Ok(placeholders);
}

function resolveSkillTarget(
  target: SkillTarget,
  { skillRefs }: Placeholders
): string {
  if ("skillId" in target) {
    return target.skillId;
  }
  const skill = skillRefs.get(target.ref);
  assert(skill, `Unresolved skill ref "${target.ref}".`);
  return skill.id;
}

function resolveSubAgentTarget(
  target: SubAgentTarget,
  { agentRefs }: Placeholders
): string {
  if ("agentId" in target) {
    return target.agentId;
  }
  const agentId = agentRefs.get(target.ref);
  assert(agentId, `Unresolved agent ref "${target.ref}".`);
  return agentId;
}

function resolveSkillRow(
  row: SkillSuggestionData,
  { skillRefs }: Placeholders
): SkillSuggestionData {
  switch (row.kind) {
    case "edit":
      return {
        kind: "edit",
        suggestion: {
          ...row.suggestion,
          instructionEdits: row.suggestion.instructionEdits?.map((edit) => ({
            ...edit,
            content: resolveSkillRefTags(edit.content, skillRefs),
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

function resolveAgentLinks(
  links: AgentLinkChanges,
  placeholders: Placeholders,
  runAgentViewId: string | null
): AgentLinkSuggestionData[] {
  const skillRows: AgentLinkSuggestionData[] = [
    ...links.addSkills.map((target) => ({
      kind: "skills" as const,
      suggestion: {
        action: "add" as const,
        skillId: resolveSkillTarget(target, placeholders),
      },
    })),
    ...links.removeSkillIds.map((skillId) => ({
      kind: "skills" as const,
      suggestion: { action: "remove" as const, skillId },
    })),
  ];
  const childAgentIds = [
    ...links.addSubAgents.map((target) => ({
      action: "add" as const,
      childAgentId: resolveSubAgentTarget(target, placeholders),
    })),
    ...links.removeSubAgentIds.map((childAgentId) => ({
      action: "remove" as const,
      childAgentId,
    })),
  ];
  if (childAgentIds.length === 0) {
    return skillRows;
  }

  assert(runAgentViewId, "The run_agent view is required for sub-agents.");
  return [
    ...skillRows,
    ...childAgentIds.map(({ action, childAgentId }) => ({
      kind: "sub_agent" as const,
      suggestion: { action, toolId: runAgentViewId, childAgentId },
    })),
  ];
}

async function recordPlannedChange(
  auth: Authenticator,
  change: PlannedChange,
  {
    batch,
    conversation,
    placeholders,
    runAgentViewId,
  }: {
    batch: BatchSuggestionResource;
    conversation: ConversationType;
    placeholders: Placeholders;
    runAgentViewId: string | null;
  }
): Promise<Result<undefined, MCPError>> {
  switch (change.type) {
    case "agent_creation": {
      const pendingAgent = placeholders.agents.get(change);
      assert(pendingAgent, "Missing placeholder agent.");
      await recordAgentCreationSuggestionOnPlaceholder(auth, pendingAgent, {
        create: {
          ...change.create,
          ...(change.skills.length > 0
            ? {
                skillIds: change.skills.map((t) =>
                  resolveSkillTarget(t, placeholders)
                ),
              }
            : {}),
          ...(change.subAgents.length > 0
            ? {
                subAgentIds: change.subAgents.map((t) =>
                  resolveSubAgentTarget(t, placeholders)
                ),
              }
            : {}),
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

      if (change.links) {
        await recordAgentLinkSuggestions(auth, change.agent, {
          data: resolveAgentLinks(change.links, placeholders, runAgentViewId),
          conversation,
          batch,
        });
      }
      return new Ok(undefined);
    }

    case "skill_creation": {
      const pendingSkill = placeholders.skills.get(change);
      assert(pendingSkill, "Missing placeholder skill.");
      await recordSkillCreationSuggestionOnPlaceholder(auth, pendingSkill, {
        create: {
          ...change.create,
          instructions: resolveSkillRefTags(
            change.create.instructions,
            placeholders.skillRefs
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
        data: change.rows.map((row) => resolveSkillRow(row, placeholders)),
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
 * skill, or a ref is unknown, declared twice or of the wrong kind, the call fails and no batch,
 * placeholder agent or skill, or suggestion row is created.
 */
/**
 * @cc [owner:achilleburah,label:product;mcp] refs-resolved-before-storage
 * Every ref of a `suggest` call MUST be resolved to the sId of the placeholder created for the
 * creation that declares it before any suggestion row is stored: all placeholders are created
 * first, then rows are written with real ids only. No stored row holds a ref.
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

  const targetsValidation = await validateExistingLinkTargets(
    auth,
    suggestions
  );
  if (targetsValidation.isErr()) {
    return targetsValidation;
  }

  const plannedChanges: PlannedChange[] = [];
  for (const suggestion of suggestions) {
    const planned = await planSuggestion(auth, suggestion);
    if (planned.isErr()) {
      return planned;
    }
    plannedChanges.push(planned.value);
  }

  const touchesSubAgents = suggestions.some(
    (suggestion) =>
      suggestion.kind === "edit_agent" &&
      (suggestion.addSubAgents?.length ?? 0) +
        (suggestion.removeSubAgentIds?.length ?? 0) >
        0
  );
  let runAgentViewId: string | null = null;
  if (touchesSubAgents) {
    const runAgentView =
      await MCPServerViewResource.getMCPServerViewForAutoInternalTool(
        auth,
        "run_agent"
      );
    if (!runAgentView) {
      return new Err(
        new MCPError("The run_agent server is not available in this workspace.")
      );
    }
    runAgentViewId = runAgentView.sId;
  }

  const batch = await BatchSuggestionResource.makeNew(auth, {
    title,
    analysis,
    sourceConversation: conversation,
  });

  const outdatePartialBatch = async () => {
    const partialBatch = await BatchSuggestionResource.fetchById(
      auth,
      batch.sId
    );
    await partialBatch?.updateState(auth, "outdated");
  };

  const placeholders = await createPlaceholders(auth, plannedChanges);
  if (placeholders.isErr()) {
    await outdatePartialBatch();
    return placeholders;
  }

  for (const change of plannedChanges) {
    const recorded = await recordPlannedChange(auth, change, {
      batch,
      conversation,
      placeholders: placeholders.value,
      runAgentViewId,
    });
    if (recorded.isErr()) {
      await outdatePartialBatch();
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
