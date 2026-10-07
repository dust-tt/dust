import { getDefaultMCPActionPayload } from "@app/lib/actions/default_mcp_action";
import { pickRandomDroidAvatarUrl } from "@app/lib/agent_builder/avatars";
import { getNewAgentModelDefaults } from "@app/lib/agent_builder/helpers";
import { validateAgentEditorsChange } from "@app/lib/api/assistant/agent_editors_change";
import type { AgentTagsChange } from "@app/lib/api/assistant/agent_tags_change";
import { validateAgentTagsChange } from "@app/lib/api/assistant/agent_tags_change";
import { createOrUpgradeAgentConfiguration } from "@app/lib/api/assistant/configuration/create_or_upgrade";
import {
  resolveAgentModelChange,
  validateStructuredOutputChange,
} from "@app/lib/api/assistant/configuration/model_update";
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
import {
  mergeAgentEdits,
  resolveInstructionsEdits,
} from "@app/lib/editor/merge_agent_suggestion_changes";
import { getMarkdownPipeline } from "@app/lib/editor/server_markdown_pipeline";
import {
  applyInstructionEditsToHtml,
  convertMarkdownToBlockHtml,
} from "@app/lib/editor/skill_instructions_html";
import { DustError } from "@app/lib/error";
import { getModelsForAuth } from "@app/lib/model_tiers/enabled_models";
import type { AgentAuditOptions } from "@app/lib/resources/agent_resource";
import { AgentResource } from "@app/lib/resources/agent_resource";
import type { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import type { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { TagResource } from "@app/lib/resources/tags_resource";
import type { AgentConfigurationAssistantPayload } from "@app/types/api/agent_configuration";
import type {
  AgentConfigurationScope,
  LightAgentConfigurationType,
} from "@app/types/assistant/agent";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { removeNulls } from "@app/types/shared/utils/general";
import type {
  CreateSuggestionType,
  EditorsSuggestionType,
  ModelSuggestionType,
  SkillsSuggestionType,
  StructuredOutputSuggestionType,
  SubAgentSuggestionType,
  TagsSuggestionType,
  ToolsSuggestionType,
} from "@app/types/suggestions/agent_suggestion";
import {
  AgentSuggestionDataSchema,
  getAgentSuggestionAction,
  INSTRUCTIONS_ROOT_TARGET_BLOCK_ID,
} from "@app/types/suggestions/agent_suggestion";
import type { TagType } from "@app/types/tag";
import type { UserType } from "@app/types/user";

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
      // Applied in place on their own when there is no full save, which needs no read access to
      // the agent's definition.
      scope: Exclude<AgentConfigurationScope, "global"> | null;
      // The complete editor set once the change is applied.
      editors: UserType[] | null;
      // Its missing tags are only created when the change is written.
      tags: AgentTagsChange | null;
    }
  | { type: "delete"; agentId: string };

export type BatchCreations = {
  skillIds: Set<string>;
  agentsById: Map<string, AgentResource>;
};

/**
 * @cc [owner:fabiencelier,label:product] create-activates-placeholder-only
 * A `create` suggestion MUST only be applied to the `pending` placeholder agent it targets: it
 * turns that placeholder into an `active`, `hidden` agent (same `sId`, editors unchanged) carrying
 * the suggested name, description, instructions, tools, skills and sub-agents. Tools, skills and
 * sub-agents are checked again against live state, as when added to an existing agent, except a
 * skill or sub-agent that a creation of the same batch makes active. Applying it to an agent that
 * is not `pending`, or with a tool, skill or sub-agent that no longer qualifies, fails with
 * `invalid_request_error` and changes nothing.
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
    subAgentIds = [],
  }: CreateSuggestionType,
  creations: BatchCreations
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
  const resolvedSubAgents = await resolveSubAgentsEdits(
    auth,
    resolvedActions.value.actions,
    subAgentIds.map((childAgentId) => ({ action: "add", childAgentId })),
    { agentId: agent.sId, createdAgentsById: creations.agentsById }
  );
  if (resolvedSubAgents.isErr()) {
    return resolvedSubAgents;
  }
  const resolvedSkills = await resolveSkillsEdits(
    auth,
    [],
    skillIds.map((skillId) => ({ action: "add", skillId })),
    creations.skillIds
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
      pictureUrl: pickRandomDroidAvatarUrl(),
      status: "active",
      scope: "hidden",
      model: getNewAgentModelDefaults(defaultModel),
      actions: resolvedSubAgents.value.actions,
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

/**
 * @cc [owner:fabiencelier,label:product] structured-output-validated-against-saved-model
 * A suggested structured output MUST be validated (`validateStructuredOutputChange`) against
 * `model`, the model the new version is saved with once any model suggestion of the same batch is
 * applied, not against the agent's current model. When validation fails, nothing is written.
 */
function resolveStructuredOutputEdit(
  model: LightAgentConfigurationType["model"],
  structuredOutput: StructuredOutputSuggestionType | undefined
): Result<LightAgentConfigurationType["model"], ApplyAgentSuggestionsError> {
  if (!structuredOutput) {
    return new Ok(model);
  }

  const { responseFormat } = structuredOutput;
  const validation = validateStructuredOutputChange({
    modelId: model.modelId,
    responseFormat,
  });
  if (validation.isErr()) {
    return new Err(
      new DustError("invalid_request_error", validation.error.message)
    );
  }

  return new Ok({ ...model, responseFormat: responseFormat ?? undefined });
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
 * sub-agents are checked again against live state (see `suggestable-sub-agents-match-builder`),
 * except an agent that a creation of the same batch makes active, and run through the `run_agent`
 * tool with the builder's defaults. A sub-agent already added, or already removed, since the
 * suggestion was recorded is skipped.
 */
async function resolveSubAgentsEdits(
  auth: Authenticator,
  currentActions: AgentActionPayload[],
  subAgents: Pick<SubAgentSuggestionType, "action" | "childAgentId">[],
  {
    agentId,
    createdAgentsById,
  }: { agentId: string; createdAgentsById: Map<string, AgentResource> }
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
      const createdAgent = createdAgentsById.get(subAgentId);
      const addition = createdAgent
        ? new Ok(createdAgent)
        : checkSubAgentAddition(subAgentId, suggestable, { agentId });
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
 * are checked again against live state, except a skill that a creation of the same batch makes
 * active. A skill already added, or already removed, since the suggestion was recorded is skipped.
 */
async function resolveSkillsEdits(
  auth: Authenticator,
  currentSkills: SkillResource[],
  skills: SkillsSuggestionType[],
  createdSkillIds: Set<string>
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
    if (createdSkillIds.has(skillId)) {
      continue;
    }
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
    structuredOutput,
    description,
    scope,
    instructions,
    skills,
    tools,
    subAgents,
  }: AgentEdits,
  creations: BatchCreations
): Promise<
  Result<AgentConfigurationAssistantPayload, ApplyAgentSuggestionsError>
> {
  // The agent as stored, which is what the save compares the new version against: every field no
  // suggestion touches is carried over exactly as it is.
  const current = await agent.buildResaveParams(auth);

  const resolvedInstructions = resolveInstructionsEdits(
    current,
    instructions ?? [],
    () => getMarkdownPipeline("agent")
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
  const resolvedStructuredOutput = resolveStructuredOutputEdit(
    resolvedModel.value,
    structuredOutput
  );
  if (resolvedStructuredOutput.isErr()) {
    return resolvedStructuredOutput;
  }
  const nextModel = resolvedStructuredOutput.value;

  const currentSkills = current.skills ?? [];
  const resolvedSkills = await resolveSkillsEdits(
    auth,
    currentSkills,
    skills ?? [],
    creations.skillIds
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
    { agentId: agent.sId, createdAgentsById: creations.agentsById }
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
 * Re-validates the suggested editor change against live state and returns the resulting editor set.
 */
async function resolveEditorsEdit(
  auth: Authenticator,
  agent: AgentResource,
  editors: EditorsSuggestionType | undefined
): Promise<Result<UserType[] | null, ApplyAgentSuggestionsError>> {
  if (!editors) {
    return new Ok(null);
  }

  const validation = await validateAgentEditorsChange(auth, agent, editors);
  if (validation.isErr()) {
    return new Err(
      new DustError("invalid_request_error", validation.error.message)
    );
  }

  return new Ok(validation.value.nextEditors.map((u) => u.toJSON()));
}

/**
 * Re-validates the suggested tag change against live state.
 */
async function resolveTagsEdit(
  auth: Authenticator,
  agent: AgentResource,
  tags: TagsSuggestionType | undefined
): Promise<Result<AgentTagsChange | null, ApplyAgentSuggestionsError>> {
  if (!tags) {
    return new Ok(null);
  }

  const validation = await validateAgentTagsChange(auth, agent, tags);
  if (validation.isErr()) {
    return new Err(
      new DustError("invalid_request_error", validation.error.message)
    );
  }

  return new Ok(validation.value);
}

/**
 * Definition fields are saved as a new version, from the agent's full definition. The scope and the
 * editors can be applied in place, so a caller holding `admin` on an agent they cannot read can
 * still change them. Tags are saved with the other definition fields when there are some, on their
 * own otherwise.
 */
function hasAgentFieldEdits({
  name,
  model,
  structuredOutput,
  description,
  instructions,
  skills,
  tools,
  subAgents,
}: AgentEdits): boolean {
  return (
    name !== undefined ||
    model !== undefined ||
    structuredOutput !== undefined ||
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
  edits: AgentEdits,
  creations: BatchCreations
): Promise<Result<ResolvedAgentChange, ApplyAgentSuggestionsError>> {
  if (agent.scope === "global" || agent.status !== "active") {
    return new Err(
      new DustError(
        "invalid_request_error",
        "Archived and global agents cannot be updated."
      )
    );
  }

  const editorsRes = await resolveEditorsEdit(auth, agent, edits.editors);
  if (editorsRes.isErr()) {
    return editorsRes;
  }
  const editors = editorsRes.value;

  const tagsRes = await resolveTagsEdit(auth, agent, edits.tags);
  if (tagsRes.isErr()) {
    return tagsRes;
  }

  // Saving the definition creates a version, so a change that only moves the scope or the editors
  // must not.
  let assistant: AgentConfigurationAssistantPayload | null = null;
  if (hasAgentFieldEdits(edits)) {
    const assistantRes = await resolveAgentFieldEdits(
      auth,
      agent,
      edits,
      creations
    );
    if (assistantRes.isErr()) {
      return assistantRes;
    }
    assistant = editors
      ? {
          ...assistantRes.value,
          editors: editors.map((editor) => ({ sId: editor.sId })),
        }
      : assistantRes.value;
  }

  return new Ok({
    type: "edit",
    agentId: agent.sId,
    assistant,
    scope: edits.scope ?? null,
    editors,
    tags: tagsRes.value,
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
    creations,
  }: {
    agent: AgentResource;
    suggestions: AgentSuggestionResource[];
    creations: BatchCreations;
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
      return resolveCreateSuggestion(
        auth,
        agent,
        parsed.data.suggestion,
        creations
      );
    }
    case "edit": {
      const edits = mergeAgentEdits(suggestions);
      if (edits.isErr()) {
        return edits;
      }
      return resolveAgentEdits(auth, agent, edits.value, creations);
    }
    case "delete":
      return resolveDeleteSuggestion(agent);
    default:
      return assertNever(action);
  }
}

async function archiveAgent(
  auth: Authenticator,
  agentId: string,
  { auditMetadata }: AgentAuditOptions
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

  const archiveResult = await agent.archive(auth, { auditMetadata });
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
  assistant: AgentConfigurationAssistantPayload,
  { auditMetadata }: AgentAuditOptions
): Promise<Result<undefined, ApplyAgentSuggestionsError>> {
  const res = await createOrUpgradeAgentConfiguration({
    auth,
    agentConfigurationId: agentId,
    assistant,
    // Pruning cleans up after edits made in the agent builder. Here we only apply suggestions:
    // they are still `pending` during the save, so pruning would wrongly outdate them.
    skipSuggestionPruning: true,
    auditMetadata,
  });
  if (res.isErr()) {
    return new Err(new DustError("invalid_request_error", res.error.message));
  }

  return new Ok(undefined);
}

/**
 * Returns the tags named `names`, matching existing tags case-insensitively
 * and creating the other ones.
 */
async function createMissingTags(
  auth: Authenticator,
  names: string[]
): Promise<TagResource[]> {
  if (names.length === 0) {
    return [];
  }

  // A tag created since the change was resolved (e.g. by another step of the batch) is reused.
  const tagsByKey = new Map(
    (await TagResource.findAll(auth)).map((tag) => [
      tag.name.toLowerCase(),
      tag,
    ])
  );
  const existing = removeNulls(
    names.map((name) => tagsByKey.get(name.toLowerCase()) ?? null)
  );
  const created = await TagResource.makeNewForNames(auth, {
    names: names.filter((name) => !tagsByKey.has(name.toLowerCase())),
    kind: "standard",
  });

  return [...existing, ...created];
}

// Removes `removeTags` from `currentTags`, then adds `addTags` not already there.
function applyTagsDelta(
  currentTags: TagType[],
  { addTags, removeTags }: { addTags: TagResource[]; removeTags: TagResource[] }
): TagType[] {
  const removedIds = new Set(removeTags.map((tag) => tag.sId));
  const kept = currentTags.filter((tag) => !removedIds.has(tag.sId));
  const keptIds = new Set(kept.map((tag) => tag.sId));

  return [
    ...kept,
    ...addTags
      .filter((tag) => !keptIds.has(tag.sId))
      .map((tag) => tag.toJSON()),
  ];
}

// Applies the changes that need no full save: scope and editors in place, and tags, which create a
// version through `updateConfiguration` (so that a workspace admin who does not edit the agent can
// change them).
async function updateAgentWithoutFullSave(
  auth: Authenticator,
  agent: AgentResource,
  {
    scope,
    editors,
    tags,
  }: {
    scope: Exclude<AgentConfigurationScope, "global"> | null;
    editors: UserType[] | null;
    tags: { addTags: TagResource[]; removeTags: TagResource[] } | null;
  },
  { auditMetadata }: AgentAuditOptions
): Promise<Result<undefined, ApplyAgentSuggestionsError>> {
  const res = await agent.updateConfiguration(
    auth,
    {
      ...(scope ? { scope } : {}),
      ...(editors ? { editors } : {}),
      ...(tags ?? {}),
    },
    { auditMetadata }
  );
  if (res.isErr()) {
    return new Err(new DustError("invalid_request_error", res.error.message));
  }

  return new Ok(undefined);
}

export async function writeAgentChange(
  auth: Authenticator,
  agent: AgentResource,
  change: ResolvedAgentChange,
  { auditMetadata }: AgentAuditOptions = {}
): Promise<Result<undefined, ApplyAgentSuggestionsError>> {
  switch (change.type) {
    case "create":
      return saveAgentConfiguration(auth, change.agentId, change.assistant, {
        auditMetadata,
      });
    case "edit": {
      const tags = change.tags
        ? {
            addTags: [
              ...change.tags.tagsToAdd,
              ...(await createMissingTags(auth, change.tags.tagNamesToCreate)),
            ],
            removeTags: change.tags.tagsToRemove,
          }
        : null;
      if (change.assistant) {
        return saveAgentConfiguration(
          auth,
          change.agentId,
          tags
            ? {
                ...change.assistant,
                tags: applyTagsDelta(change.assistant.tags, tags),
              }
            : change.assistant,
          { auditMetadata }
        );
      }
      if (change.scope || change.editors || tags) {
        return updateAgentWithoutFullSave(
          auth,
          agent,
          { ...change, tags },
          { auditMetadata }
        );
      }
      return new Ok(undefined);
    }
    case "delete":
      return archiveAgent(auth, change.agentId, { auditMetadata });
    default:
      return assertNever(change);
  }
}
