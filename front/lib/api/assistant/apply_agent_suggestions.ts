import { getDefaultMCPActionPayload } from "@app/lib/actions/default_mcp_action";
import { DROID_AVATAR_URLS } from "@app/lib/agent_builder/avatars";
import { createOrUpgradeAgentConfiguration } from "@app/lib/api/assistant/configuration/create_or_upgrade";
import { resolveAgentModelChange } from "@app/lib/api/assistant/configuration/model_update";
import { getAgentConfigurationRequirementsFromCapabilities } from "@app/lib/api/assistant/permissions";
import {
  checkSkillAddition,
  fetchSuggestableSkills,
} from "@app/lib/api/assistant/suggestable_skills";
import {
  checkSubAgentAddition,
  checkSubAgentRemoval,
  fetchRunAgentTool,
  fetchSuggestableSubAgents,
} from "@app/lib/api/assistant/suggestable_sub_agents";
import {
  checkToolAddition,
  checkToolRemoval,
  fetchSuggestableTools,
} from "@app/lib/api/assistant/suggestable_tools";
import type { Authenticator } from "@app/lib/auth";
import type { AgentEdits } from "@app/lib/editor/merge_agent_suggestion_changes";
import { mergeAgentEdits } from "@app/lib/editor/merge_agent_suggestion_changes";
import {
  applyInstructionEditsToHtml,
  convertMarkdownToBlockHtml,
  getMarkdownPipeline,
} from "@app/lib/editor/skill_instructions_html";
import { DustError } from "@app/lib/error";
import { getModelsForAuth } from "@app/lib/model_tiers/enabled_models";
import { AgentResource } from "@app/lib/resources/agent_resource";
import type { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { AgentConfigurationAssistantPayload } from "@app/types/api/agent_configuration";
import type {
  AgentConfigurationScope,
  LightAgentConfigurationType,
} from "@app/types/assistant/agent";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type {
  CreateSuggestionType,
  InstructionsSuggestionSchemaType,
  ModelSuggestionType,
  SkillsSuggestionType,
  SubAgentSuggestionType,
  ToolsSuggestionType,
} from "@app/types/suggestions/agent_suggestion";
import {
  AgentSuggestionDataSchema,
  getAgentSuggestionAction,
  INSTRUCTIONS_ROOT_TARGET_BLOCK_ID,
} from "@app/types/suggestions/agent_suggestion";

type ApplyAgentSuggestionsError = DustError<"invalid_request_error">;

/**
 * A change resolved against the current state of its agent: every check has passed and the write
 * is fully computed.
 */
export type ResolvedAgentChange =
  | {
      type: "create";
      agentId: string;
      assistant: AgentConfigurationAssistantPayload;
    }
  | {
      type: "edit";
      agentId: string;
      assistant: AgentConfigurationAssistantPayload | null;
      // Applied in place on its own when there is no full save, which needs no read access to the
      // agent's definition.
      scope: Exclude<AgentConfigurationScope, "global"> | null;
    }
  | { type: "delete"; agentId: string };

function pickDefaultAvatar(): string {
  return DROID_AVATAR_URLS[
    Math.floor(Math.random() * DROID_AVATAR_URLS.length)
  ];
}

/**
 * @cc [owner:fabiencelier,label:product] create-activates-placeholder-only
 * A `create` suggestion MUST only be applied to the `pending` placeholder agent it targets: it
 * turns that placeholder into an `active`, `hidden` agent (same `sId`, editors unchanged) carrying
 * the suggested name, description, instructions, tools and skills. Tools and skills are checked
 * again against live state, as when added to an existing agent. Applying it to an agent that is not
 * `pending`, or with a tool or skill that no longer qualifies, fails with `invalid_request_error`
 * and changes nothing.
 */
async function resolveCreateSuggestion(
  auth: Authenticator,
  agent: AgentResource,
  {
    name,
    description,
    instructions,
    toolIds = [],
    skillIds = [],
  }: CreateSuggestionType
): Promise<Result<ResolvedAgentChange, ApplyAgentSuggestionsError>> {
  if (agent.status !== "pending") {
    return new Err(
      new DustError(
        "invalid_request_error",
        "The agent this suggestion targets has already been created."
      )
    );
  }

  // Neither editor access nor the `create` capability is re-checked here: callers authorize the
  // suggestions first (see `callers-authorize-suggestions`), and `createAgentConfiguration` refuses
  // to update a pending agent owned by someone else.

  // The suggested instructions are HTML: run them through the editor schema so the stored
  // markdown and block HTML match what the builder would have saved.
  const converted = applyInstructionEditsToHtml(
    convertMarkdownToBlockHtml("", getMarkdownPipeline("agent")),
    [
      {
        targetBlockId: INSTRUCTIONS_ROOT_TARGET_BLOCK_ID,
        content: instructions,
      },
    ],
    getMarkdownPipeline("agent")
  );
  if (converted.isErr()) {
    return converted;
  }

  const resolvedActions = await resolveToolsEdits(
    auth,
    [],
    toolIds.map((toolId) => ({ action: "add", toolId }))
  );
  if (resolvedActions.isErr()) {
    return resolvedActions;
  }
  const resolvedSkills = await resolveSkillsEdits(
    auth,
    [],
    skillIds.map((skillId) => ({ action: "add", skillId }))
  );
  if (resolvedSkills.isErr()) {
    return resolvedSkills;
  }

  const [editors, { defaultModel }] = await Promise.all([
    agent.listEditors(auth).then((editors) => editors ?? []),
    getModelsForAuth(auth),
  ]);

  return new Ok({
    type: "create",
    agentId: agent.sId,
    assistant: {
      name,
      description,
      instructions: converted.value.instructions,
      instructionsHtml: converted.value.instructionsHtml,
      pictureUrl: pickDefaultAvatar(),
      status: "active",
      scope: "hidden",
      model: {
        providerId: defaultModel.providerId,
        modelId: defaultModel.modelId,
        temperature: 0.7,
        reasoningEffort: defaultModel.defaultReasoningEffort,
      },
      actions: resolvedActions.value.actions,
      skills: resolvedSkills.value.skillIds.map((sId) => ({ sId })),
      tags: [],
      editors: editors.map((e) => ({ sId: e.sId })),
    },
  });
}

function resolveDeleteSuggestion(
  agent: AgentResource
): Result<ResolvedAgentChange, ApplyAgentSuggestionsError> {
  if (agent.status !== "active") {
    return new Err(
      new DustError(
        "invalid_request_error",
        "Only an active agent can be deleted."
      )
    );
  }

  // Editor access is enforced by the callers (`agent.canEdit`), matching the manual DELETE route.
  return new Ok({ type: "delete", agentId: agent.sId });
}

interface ResolvedInstructions {
  instructions: string | null;
  instructionsHtml: string | null;
}

/** Carries the agent's current instructions over untouched when no suggestion edits them. */
function resolveInstructionsEdits(
  agentConfiguration: {
    instructions: string | null;
    instructionsHtml: string | null;
  },
  edits: InstructionsSuggestionSchemaType[]
): Result<ResolvedInstructions, ApplyAgentSuggestionsError> {
  if (edits.length === 0) {
    return new Ok({
      instructions: agentConfiguration.instructions,
      instructionsHtml: agentConfiguration.instructionsHtml,
    });
  }

  if (!agentConfiguration.instructionsHtml) {
    return new Err(
      new DustError(
        "invalid_request_error",
        "The agent this suggestion targets has no block-structured instructions."
      )
    );
  }

  return applyInstructionEditsToHtml(
    agentConfiguration.instructionsHtml,
    edits.map(({ targetBlockId, content }) => ({ targetBlockId, content })),
    getMarkdownPipeline("agent")
  );
}

/**
 * Carries the agent's current model over untouched when no suggestion changes it. Model
 * availability and reasoning effort support are re-validated against live state, the
 * agent's own temperature and response format are carried over regardless.
 */
async function resolveModelEdit(
  auth: Authenticator,
  currentModel: LightAgentConfigurationType["model"],
  model: ModelSuggestionType | undefined
): Promise<
  Result<LightAgentConfigurationType["model"], ApplyAgentSuggestionsError>
> {
  if (!model) {
    return new Ok(currentModel);
  }

  const modelRes = await resolveAgentModelChange(auth, model);
  if (modelRes.isErr()) {
    return new Err(
      new DustError("invalid_request_error", modelRes.error.message)
    );
  }

  return new Ok({ ...currentModel, ...modelRes.value });
}

type AgentActionPayload = AgentConfigurationAssistantPayload["actions"][number];

/**
 * Carries the agent's current actions over, with the suggested tools added or removed. Each tool is
 * checked again against live state (see `suggestable-tools-match-list-tools`). A tool already added,
 * or already removed, since the suggestion was recorded is skipped.
 */
async function resolveToolsEdits(
  auth: Authenticator,
  currentActions: AgentActionPayload[],
  tools: ToolsSuggestionType[]
): Promise<
  Result<
    { actions: AgentActionPayload[]; hasRemovedTools: boolean },
    ApplyAgentSuggestionsError
  >
> {
  const hasTool = (toolId: string) =>
    currentActions.some((action) => action.mcpServerViewId === toolId);
  const removedToolIds = new Set(
    tools
      .filter((t) => t.action === "remove" && hasTool(t.toolId))
      .map((t) => t.toolId)
  );
  const addedToolIds = new Set(
    tools
      .filter((t) => t.action === "add" && !hasTool(t.toolId))
      .map((t) => t.toolId)
  );

  const suggestable = await fetchSuggestableTools(auth, [
    ...removedToolIds,
    ...addedToolIds,
  ]);

  for (const toolId of removedToolIds) {
    const removal = checkToolRemoval(toolId, suggestable, currentActions);
    if (removal.isErr()) {
      return new Err(new DustError("invalid_request_error", removal.error));
    }
  }
  const actions = currentActions.filter(
    (action) => !removedToolIds.has(action.mcpServerViewId)
  );

  for (const toolId of addedToolIds) {
    const addition = checkToolAddition(toolId, suggestable);
    if (addition.isErr()) {
      return new Err(new DustError("invalid_request_error", addition.error));
    }
    actions.push(
      getDefaultMCPActionPayload(addition.value, {
        takenNames: new Set(actions.map((action) => action.name)),
      })
    );
  }

  return new Ok({ actions, hasRemovedTools: removedToolIds.size > 0 });
}

/**
 * Carries the agent's actions over, with the suggested sub-agents added or removed. Added
 * sub-agents are checked again against live state (see `suggestable-sub-agents-match-builder`)
 * and run through the `run_agent` tool with the builder's defaults. A sub-agent already added, or
 * already removed, since the suggestion was recorded is skipped.
 */
async function resolveSubAgentsEdits(
  auth: Authenticator,
  currentActions: AgentActionPayload[],
  subAgents: SubAgentSuggestionType[],
  { agentId }: { agentId: string }
): Promise<
  Result<
    { actions: AgentActionPayload[]; hasRemovedSubAgents: boolean },
    ApplyAgentSuggestionsError
  >
> {
  const hasSubAgent = (subAgentId: string) =>
    currentActions.some((action) => action.childAgentId === subAgentId);
  const removedSubAgentIds = new Set(
    subAgents
      .filter((s) => s.action === "remove" && hasSubAgent(s.childAgentId))
      .map((s) => s.childAgentId)
  );
  const addedSubAgentIds = new Set(
    subAgents
      .filter((s) => s.action === "add" && !hasSubAgent(s.childAgentId))
      .map((s) => s.childAgentId)
  );

  for (const subAgentId of removedSubAgentIds) {
    const removal = checkSubAgentRemoval(subAgentId, currentActions);
    if (removal.isErr()) {
      return new Err(new DustError("invalid_request_error", removal.error));
    }
  }
  const actions = currentActions.filter(
    (action) =>
      action.childAgentId === null ||
      !removedSubAgentIds.has(action.childAgentId)
  );

  if (addedSubAgentIds.size > 0) {
    const runAgentTool = await fetchRunAgentTool(auth);
    if (!runAgentTool) {
      return new Err(
        new DustError(
          "invalid_request_error",
          "The tool to run sub-agents is not available."
        )
      );
    }
    const suggestable = await fetchSuggestableSubAgents(auth, [
      ...addedSubAgentIds,
    ]);
    for (const subAgentId of addedSubAgentIds) {
      const addition = checkSubAgentAddition(subAgentId, suggestable, {
        agentId,
      });
      if (addition.isErr()) {
        return new Err(new DustError("invalid_request_error", addition.error));
      }
      actions.push(
        getDefaultMCPActionPayload(runAgentTool, {
          takenNames: new Set(actions.map((action) => action.name)),
          childAgent: addition.value,
        })
      );
    }
  }

  return new Ok({
    actions,
    hasRemovedSubAgents: removedSubAgentIds.size > 0,
  });
}

/**
 * Carries the agent's current skills over, with the suggested skills added or removed. Added skills
 * are checked again against live state. A skill already added, or already removed,
 * since the suggestion was recorded is skipped.
 */
async function resolveSkillsEdits(
  auth: Authenticator,
  currentSkills: SkillResource[],
  skills: SkillsSuggestionType[]
): Promise<
  Result<
    { skillIds: string[]; hasRemovedSkills: boolean },
    ApplyAgentSuggestionsError
  >
> {
  const hasSkill = (skillId: string) =>
    currentSkills.some((skill) => skill.sId === skillId);
  const removedSkillIds = new Set(
    skills
      .filter((s) => s.action === "remove" && hasSkill(s.skillId))
      .map((s) => s.skillId)
  );
  const addedSkillIds = new Set(
    skills
      .filter((s) => s.action === "add" && !hasSkill(s.skillId))
      .map((s) => s.skillId)
  );

  const suggestable = await fetchSuggestableSkills(auth, [...addedSkillIds]);
  for (const skillId of addedSkillIds) {
    const addition = checkSkillAddition(skillId, suggestable);
    if (addition.isErr()) {
      return new Err(new DustError("invalid_request_error", addition.error));
    }
  }

  return new Ok({
    skillIds: [
      ...currentSkills
        .map((skill) => skill.sId)
        .filter((skillId) => !removedSkillIds.has(skillId)),
      ...addedSkillIds,
    ],
    hasRemovedSkills: removedSkillIds.size > 0,
  });
}

// TODO: save a separate field for manually added space ids like for skills
// so we don't need to infer what is manual and what is not.
/**
 * @cc [owner:fabiencelier,label:security;product] removed-capability-lifts-its-space
 * When a batch removes a tool, a sub-agent or a skill, the agent's additional requested spaces MUST
 * be recomputed as the builder does (its requested spaces minus those its current actions and
 * skills imply), so that a space only the removed capability required no longer restricts the
 * agent. Without a removal, the requested spaces are carried over as they are.
 */
async function getAdditionalRequestedSpaceModelIds(
  auth: Authenticator,
  {
    requestedSpaceModelIds,
    actions,
    skills,
  }: {
    requestedSpaceModelIds: ModelId[];
    actions: AgentActionPayload[];
    skills: SkillResource[];
  }
): Promise<ModelId[]> {
  const implied = await getAgentConfigurationRequirementsFromCapabilities(
    auth,
    { actions, skills }
  );
  const impliedSpaceModelIds = new Set(implied.requestedSpaceIds);

  return requestedSpaceModelIds.filter(
    (spaceId) => !impliedSpaceModelIds.has(spaceId)
  );
}

/**
 * @cc [owner:matteotrab,label:product] field-edits-carry-the-agent-over
 * `createOrUpgradeAgentConfiguration` replaces the whole agent, so every field no suggestion
 * touched MUST be carried over from its current version: a batch that only renames the agent
 * leaves everything else as it was.
 */
async function resolveAgentFieldEdits(
  auth: Authenticator,
  agent: AgentResource,
  {
    name,
    model,
    description,
    scope,
    instructions,
    skills,
    tools,
    subAgents,
  }: AgentEdits
): Promise<
  Result<AgentConfigurationAssistantPayload, ApplyAgentSuggestionsError>
> {
  // The agent as stored, which is what the save compares the new version against: every field no
  // suggestion touches is carried over exactly as it is.
  const current = await agent.buildResaveParams(auth);

  const resolvedInstructions = resolveInstructionsEdits(
    current,
    instructions ?? []
  );
  if (resolvedInstructions.isErr()) {
    return resolvedInstructions;
  }
  const {
    instructions: nextInstructions,
    instructionsHtml: nextInstructionsHtml,
  } = resolvedInstructions.value;

  const resolvedModel = await resolveModelEdit(auth, current.model, model);
  if (resolvedModel.isErr()) {
    return resolvedModel;
  }
  const nextModel = resolvedModel.value;

  const currentSkills = current.skills ?? [];
  const resolvedSkills = await resolveSkillsEdits(
    auth,
    currentSkills,
    skills ?? []
  );
  if (resolvedSkills.isErr()) {
    return resolvedSkills;
  }
  const currentActions = current.actions ?? [];
  const resolvedActions = await resolveToolsEdits(
    auth,
    currentActions,
    tools ?? []
  );
  if (resolvedActions.isErr()) {
    return resolvedActions;
  }
  const resolvedToolsWithSubAgents = await resolveSubAgentsEdits(
    auth,
    resolvedActions.value.actions,
    subAgents ?? [],
    { agentId: agent.sId }
  );
  if (resolvedToolsWithSubAgents.isErr()) {
    return resolvedToolsWithSubAgents;
  }
  const additionalRequestedSpaceModelIds =
    resolvedSkills.value.hasRemovedSkills ||
    resolvedActions.value.hasRemovedTools ||
    resolvedToolsWithSubAgents.value.hasRemovedSubAgents
      ? await getAdditionalRequestedSpaceModelIds(auth, {
          requestedSpaceModelIds: current.requestedSpaceIds,
          actions: currentActions,
          skills: currentSkills,
        })
      : current.requestedSpaceIds;

  // Some skills may not be readable by the caller because of their requested spaces,
  // however in that case also the agent would be unreadable as it would request the
  // same spaces.
  return new Ok({
    name: name ?? current.name,
    description: description ?? current.description,
    instructions: nextInstructions,
    instructionsHtml: nextInstructionsHtml,
    pictureUrl: current.pictureUrl,
    status: current.status,
    scope: scope ?? current.scope,
    model: nextModel,
    actions: resolvedToolsWithSubAgents.value.actions,
    templateId: current.templateId,
    tags: current.tags,
    editors: current.editors.map((editor) => ({ sId: editor.sId })),
    skills: resolvedSkills.value.skillIds.map((sId) => ({ sId })),
    additionalRequestedSpaceIds: additionalRequestedSpaceModelIds.map((id) =>
      SpaceResource.modelIdToSId({
        id,
        workspaceId: auth.getNonNullableWorkspace().id,
      })
    ),
  });
}

/**
 * Definition fields are saved as a new version, from the agent's full definition. The scope can be
 * applied in place, so a caller holding `admin` on an agent they cannot read can still change it.
 */
function hasAgentFieldEdits({
  name,
  model,
  description,
  instructions,
  skills,
  tools,
  subAgents,
}: AgentEdits): boolean {
  return (
    name !== undefined ||
    model !== undefined ||
    description !== undefined ||
    (instructions?.length ?? 0) > 0 ||
    (skills?.length ?? 0) > 0 ||
    (tools?.length ?? 0) > 0 ||
    (subAgents?.length ?? 0) > 0
  );
}

async function resolveAgentEdits(
  auth: Authenticator,
  agent: AgentResource,
  edits: AgentEdits
): Promise<Result<ResolvedAgentChange, ApplyAgentSuggestionsError>> {
  if (agent.scope === "global" || agent.status !== "active") {
    return new Err(
      new DustError(
        "invalid_request_error",
        "Archived and global agents cannot be updated."
      )
    );
  }

  // Saving the definition creates a version, so a change that only moves the scope must not.
  let assistant: AgentConfigurationAssistantPayload | null = null;
  if (hasAgentFieldEdits(edits)) {
    const assistantRes = await resolveAgentFieldEdits(auth, agent, edits);
    if (assistantRes.isErr()) {
      return assistantRes;
    }
    assistant = assistantRes.value;
  }

  return new Ok({
    type: "edit",
    agentId: agent.sId,
    assistant,
    scope: edits.scope ?? null,
  });
}

/**
 * @cc [owner:matteotrab,label:product] single-action-per-agent
 * `suggestions` MUST all create, all edit, or all delete `agent`: when they mix these actions, the
 * resolution fails and no change is returned. Each change is resolved against the current state of
 * `agent`, so a second change on the same agent would be written from stale state.
 */
/**
 * @cc [owner:matteotrab,label:security] callers-authorize-suggestions
 * Callers MUST authorize `suggestions` with `isAuthorizedToApplyAgentSuggestions` against the live
 * `agent` before calling this. Permissions are not re-checked here, and the write path does not
 * re-check the workspace `create` capability when it saves the existing `pending` placeholder.
 */
export async function resolveAgentSuggestions(
  auth: Authenticator,
  {
    agent,
    suggestions,
  }: {
    agent: AgentResource;
    suggestions: AgentSuggestionResource[];
  }
): Promise<Result<ResolvedAgentChange, ApplyAgentSuggestionsError>> {
  const actions = new Set(
    suggestions.map((suggestion) => getAgentSuggestionAction(suggestion.kind))
  );
  const [action] = actions;
  if (!action || actions.size > 1) {
    return new Err(
      new DustError(
        "invalid_request_error",
        "Suggestions applied together must all create, all edit, or all delete the agent."
      )
    );
  }

  switch (action) {
    case "create": {
      const [suggestion] = suggestions;
      const parsed = AgentSuggestionDataSchema.safeParse({
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
            "An agent is created from a single valid create suggestion."
          )
        );
      }
      return resolveCreateSuggestion(auth, agent, parsed.data.suggestion);
    }
    case "edit": {
      const edits = mergeAgentEdits(suggestions);
      if (edits.isErr()) {
        return edits;
      }
      return resolveAgentEdits(auth, agent, edits.value);
    }
    case "delete":
      return resolveDeleteSuggestion(agent);
    default:
      return assertNever(action);
  }
}

async function archiveAgent(
  auth: Authenticator,
  agentId: string
): Promise<Result<undefined, ApplyAgentSuggestionsError>> {
  // Fetched at write time: an earlier write may have saved a newer version of the agent.
  const agent = await AgentResource.fetchById(auth, agentId);
  if (!agent) {
    return new Err(
      new DustError(
        "invalid_request_error",
        "The agent this suggestion targets was not found."
      )
    );
  }

  const archiveResult = await agent.archive(auth);
  if (archiveResult.isErr()) {
    return new Err(
      new DustError("invalid_request_error", archiveResult.error.message)
    );
  }
  if (!archiveResult.value) {
    return new Err(
      new DustError(
        "invalid_request_error",
        "The agent this suggestion targets was not found."
      )
    );
  }

  return new Ok(undefined);
}

async function saveAgentConfiguration(
  auth: Authenticator,
  agentId: string,
  assistant: AgentConfigurationAssistantPayload
): Promise<Result<undefined, ApplyAgentSuggestionsError>> {
  const res = await createOrUpgradeAgentConfiguration({
    auth,
    agentConfigurationId: agentId,
    assistant,
    // Pruning cleans up after edits made in the agent builder. Here we only apply suggestions:
    // they are still `pending` during the save, so pruning would wrongly outdate them.
    skipSuggestionPruning: true,
  });
  if (res.isErr()) {
    return new Err(new DustError("invalid_request_error", res.error.message));
  }

  return new Ok(undefined);
}

async function updateAgentScope(
  auth: Authenticator,
  agent: AgentResource,
  scope: Exclude<AgentConfigurationScope, "global">
): Promise<Result<undefined, ApplyAgentSuggestionsError>> {
  const res = await agent.updateConfiguration(auth, { scope });
  if (res.isErr()) {
    return new Err(new DustError("invalid_request_error", res.error.message));
  }

  return new Ok(undefined);
}

export async function writeAgentChange(
  auth: Authenticator,
  agent: AgentResource,
  change: ResolvedAgentChange
): Promise<Result<undefined, ApplyAgentSuggestionsError>> {
  switch (change.type) {
    case "create":
      return saveAgentConfiguration(auth, change.agentId, change.assistant);
    case "edit":
      if (change.assistant) {
        return saveAgentConfiguration(auth, change.agentId, change.assistant);
      }
      if (change.scope) {
        return updateAgentScope(auth, agent, change.scope);
      }
      return new Ok(undefined);
    case "delete":
      return archiveAgent(auth, change.agentId);
    default:
      return assertNever(change);
  }
}
