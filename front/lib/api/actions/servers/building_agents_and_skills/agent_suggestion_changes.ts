import { MCPError } from "@app/lib/actions/mcp_errors";
import { getPrefixedToolName } from "@app/lib/actions/tool_name_utils";
import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import {
  AGENT_NAME_FORMAT_ERROR_MESSAGES,
  getAgentNameFormatError,
} from "@app/lib/agent_builder/helpers";
import { validateInstructionEditTargets } from "@app/lib/api/actions/servers/building_agents_and_skills/instruction_edits";
import {
  LIST_MODELS_TOOL_NAME,
  WORKSPACE_MANAGEMENT_SERVER_NAME,
} from "@app/lib/api/actions/servers/workspace_management/metadata";
import { validateAgentEditorsChange } from "@app/lib/api/assistant/agent_editors_change";
import type { InstructionSuggestionEditInput } from "@app/lib/api/assistant/agent_instructions_suggestions";
import { isAuthorizedForAgentSuggestionKind } from "@app/lib/api/assistant/agent_suggestion_authorization";
import { canAddPendingSuggestions } from "@app/lib/api/assistant/agent_suggestion_limits";
import {
  markDuplicateSuggestionsAsOutdated,
  pruneSupersededSingletonSuggestions,
} from "@app/lib/api/assistant/agent_suggestion_pruning";
import { validateAgentTagsChange } from "@app/lib/api/assistant/agent_tags_change";
import { getAgentIdFromName } from "@app/lib/api/assistant/configuration/helpers";
import {
  resolveAgentModelChange,
  validateStructuredOutputChange,
} from "@app/lib/api/assistant/configuration/model_update";
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
import { DustError } from "@app/lib/error";
import type { AgentResource } from "@app/lib/resources/agent_resource";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import type { BatchSuggestionResource } from "@app/lib/resources/batch_suggestion_resource";
import type { ConversationType } from "@app/types/assistant/conversation";
import type {
  ModelIdType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type {
  AgentSuggestionData,
  AgentSuggestionKind,
  CreateSuggestionType,
  DeleteSuggestionType,
  DescriptionSuggestionType,
  EditorsSuggestionType,
  ModelSuggestionType,
  NameSuggestionType,
  ScopeSuggestionType,
  SkillsSuggestionType,
  StructuredOutputSuggestionType,
  SubAgentSuggestionType,
  TagsSuggestionType,
  ToolsSuggestionType,
} from "@app/types/suggestions/agent_suggestion";
import {
  isSkillsSuggestion,
  isSubAgentSuggestion,
  isToolsSuggestion,
} from "@app/types/suggestions/agent_suggestion";

// Validators shared by the single-change `suggest_agent_*` tools and the `suggest` tool. They run
// against live state and never write, so a batch can validate every change before recording any.

export async function validateAgentNameChange(
  auth: Authenticator,
  agent: AgentResource,
  { name }: { name: string }
): Promise<
  Result<
    NameSuggestionType,
    DustError<"unauthorized" | "invalid_request_error" | "name_conflict">
  >
> {
  if (!isAuthorizedForAgentSuggestionKind(auth, agent, "name")) {
    return new Err(
      new DustError("unauthorized", "Only editors of this agent can rename it.")
    );
  }

  if (agent.status !== "active") {
    return new Err(
      new DustError(
        "invalid_request_error",
        "Only active agents can be renamed."
      )
    );
  }

  if (name.trim() === agent.name) {
    return new Err(
      new DustError(
        "invalid_request_error",
        `The agent is already named "${agent.name}".`
      )
    );
  }

  return validateAgentName(auth, { name });
}

/**
 * The rules a new agent name must follow, whether for a rename or a creation: non-empty once
 * trimmed, no spaces, and not carried by another active agent of the workspace.
 */
async function validateAgentName(
  auth: Authenticator,
  { name }: { name: string }
): Promise<
  Result<
    NameSuggestionType,
    DustError<"invalid_request_error" | "name_conflict">
  >
> {
  const trimmedName = name.trim();
  const formatError = getAgentNameFormatError(trimmedName);
  if (formatError) {
    return new Err(
      new DustError(
        "invalid_request_error",
        AGENT_NAME_FORMAT_ERROR_MESSAGES[formatError]
      )
    );
  }

  if (await getAgentIdFromName(auth, trimmedName)) {
    return new Err(
      new DustError(
        "name_conflict",
        `An agent with the name "${trimmedName}" already exists.`
      )
    );
  }

  return new Ok({ name: trimmedName });
}

export function validateAgentDescriptionChange(
  auth: Authenticator,
  agent: AgentResource,
  { description }: { description: string }
): Result<
  DescriptionSuggestionType,
  DustError<"unauthorized" | "invalid_request_error">
> {
  if (!isAuthorizedForAgentSuggestionKind(auth, agent, "description")) {
    return new Err(
      new DustError(
        "unauthorized",
        "Only editors of this agent can change its description."
      )
    );
  }

  if (agent.status !== "active") {
    return new Err(
      new DustError(
        "invalid_request_error",
        "Only active agents can have their description changed."
      )
    );
  }

  const trimmedDescription = description.trim();
  if (!trimmedDescription) {
    return new Err(
      new DustError(
        "invalid_request_error",
        "Agent description cannot be empty."
      )
    );
  }

  if (trimmedDescription === agent.description) {
    return new Err(
      new DustError(
        "invalid_request_error",
        `The agent is already described as "${agent.description}".`
      )
    );
  }

  return new Ok({ description: trimmedDescription });
}

export function validateAgentPublishStateChange(
  auth: Authenticator,
  agent: AgentResource,
  { scope }: { scope: "hidden" | "visible" }
): Result<
  ScopeSuggestionType,
  DustError<"unauthorized" | "invalid_request_error">
> {
  if (!isAuthorizedForAgentSuggestionKind(auth, agent, "scope")) {
    return new Err(
      new DustError(
        "unauthorized",
        "Only editors of this agent can change its publish state."
      )
    );
  }

  if (agent.status !== "active") {
    return new Err(
      new DustError(
        "invalid_request_error",
        "Only active agents can have their publish state changed."
      )
    );
  }

  if (scope === agent.scope) {
    return new Err(
      new DustError(
        "invalid_request_error",
        scope === "visible"
          ? "The agent is already published."
          : "The agent is already unpublished."
      )
    );
  }

  return new Ok({ scope });
}

/**
 * Applies the validation the suggestion is applied with (`validateAgentEditorsChange`), so a
 * suggestion that is created as pending can be applied later.
 */
export async function validateAgentEditorsSuggestion(
  auth: Authenticator,
  agent: AgentResource,
  {
    addUserIds,
    removeUserIds,
  }: { addUserIds: string[]; removeUserIds: string[] }
): Promise<Result<EditorsSuggestionType, MCPError>> {
  if (!isAuthorizedForAgentSuggestionKind(auth, agent, "editors")) {
    return new Err(
      new MCPError(
        "Only editors of this agent or workspace admins can change its editors."
      )
    );
  }

  const validation = await validateAgentEditorsChange(auth, agent, {
    addUserIds,
    removeUserIds,
  });
  if (validation.isErr()) {
    return new Err(new MCPError(validation.error.message));
  }

  return new Ok({ addUserIds, removeUserIds });
}

/**
 * Applies the validation the suggestion is applied with (`validateAgentTagsChange`), so a
 * suggestion that is created as pending can be applied later. Records the tags by name, as stored.
 */
export async function validateAgentTagsSuggestion(
  auth: Authenticator,
  agent: AgentResource,
  { addTags, removeTags }: { addTags: string[]; removeTags: string[] }
): Promise<Result<TagsSuggestionType, MCPError>> {
  const validation = await validateAgentTagsChange(auth, agent, {
    addTags,
    removeTags,
  });
  if (validation.isErr()) {
    return new Err(new MCPError(validation.error.message));
  }

  return new Ok({
    addTags: validation.value.addTags,
    removeTags: validation.value.removeTags,
  });
}

/**
 * Applies the validation the suggestion is applied with (`validateStructuredOutputChange`), against
 * `modelId`: the model the agent will run once the suggestions of the same edit are applied.
 */
export function validateAgentStructuredOutputChange(
  auth: Authenticator,
  agent: AgentResource,
  {
    modelId,
    responseFormat,
  }: { modelId: ModelIdType; responseFormat: string | null }
): Result<StructuredOutputSuggestionType, MCPError> {
  if (!isAuthorizedForAgentSuggestionKind(auth, agent, "structured_output")) {
    return new Err(
      new MCPError(
        "Only editors can suggest changing a workspace agent's structured output."
      )
    );
  }

  if (agent.status !== "active") {
    return new Err(
      new MCPError(
        "Only active agents can have their structured output changed."
      )
    );
  }

  const currentResponseFormat = agent.modelConfiguration.responseFormat ?? null;
  if (responseFormat === currentResponseFormat) {
    return new Err(
      new MCPError(
        responseFormat === null
          ? "The agent has no structured output to remove."
          : "The agent already has this structured output."
      )
    );
  }

  const validation = validateStructuredOutputChange({
    modelId,
    responseFormat,
  });
  if (validation.isErr()) {
    return new Err(new MCPError(validation.error.message));
  }

  return new Ok({ responseFormat });
}

/**
 * Applies the validation `updateAgentConfigurationsModel` applies when the suggestion is approved
 * (`resolveAgentModelChange`), so a suggestion that is created as pending can be applied later.
 */
export async function validateAgentModelChange(
  auth: Authenticator,
  agent: AgentResource,
  {
    modelId,
    reasoningEffort,
  }: { modelId: ModelIdType; reasoningEffort?: ReasoningEffort }
): Promise<Result<ModelSuggestionType, MCPError>> {
  if (!isAuthorizedForAgentSuggestionKind(auth, agent, "model")) {
    return new Err(
      new MCPError(
        "Only editors can suggest changing a workspace agent's model."
      )
    );
  }

  if (agent.status !== "active") {
    return new Err(
      new MCPError("Only active agents can have their model changed.")
    );
  }

  const resolved = await resolveAgentModelChange(auth, {
    modelId,
    reasoningEffort,
  });
  if (resolved.isErr()) {
    return new Err(
      new MCPError(
        `${resolved.error.message} Pick a modelId and reasoning effort listed by ` +
          `${getPrefixedToolName(WORKSPACE_MANAGEMENT_SERVER_NAME, LIST_MODELS_TOOL_NAME)}.`
      )
    );
  }

  return new Ok({ modelId, reasoningEffort });
}

export function validateAgentDeletion(
  auth: Authenticator,
  agent: AgentResource
): Result<DeleteSuggestionType, MCPError> {
  if (!isAuthorizedForAgentSuggestionKind(auth, agent, "delete")) {
    return new Err(
      new MCPError("Only editors can suggest deleting a workspace agent.")
    );
  }

  if (agent.status !== "active") {
    return new Err(new MCPError("Only active agents can be deleted."));
  }

  return new Ok({ name: agent.name });
}

/**
 * Validates block-targeted instruction edits against the agent's live instructions and the pending
 * `instructions` cap (see `pending-suggestion-limit-enforced-by-caller`).
 */
export async function validateAgentInstructionsChange(
  auth: Authenticator,
  agent: AgentResource,
  edits: InstructionSuggestionEditInput[]
): Promise<Result<InstructionSuggestionEditInput[], MCPError>> {
  if (!isAuthorizedForAgentSuggestionKind(auth, agent, "instructions")) {
    return new Err(
      new MCPError(
        "Only editors can suggest changing a workspace agent's instructions."
      )
    );
  }

  if (agent.status !== "active") {
    return new Err(
      new MCPError("Only active agents can have their instructions changed.")
    );
  }

  if (!agent.canViewContent) {
    return new Err(
      new MCPError(
        "The instructions of this agent are not readable, so instruction edits cannot be " +
          "suggested."
      )
    );
  }

  const { instructionsHtml } = await agent.fetchInstructions();
  if (!instructionsHtml) {
    return new Err(
      new MCPError(
        "This agent has no block-structured instructions, so instruction edits cannot be " +
          "targeted."
      )
    );
  }

  const pending = await AgentSuggestionResource.listByAgentConfigurationId(
    auth,
    agent.sId,
    { states: ["pending"], kind: "instructions" }
  );
  const limitCheck = canAddPendingSuggestions({
    kind: "instructions",
    newPendingCount: edits.length,
    currentPendingCount: pending.length,
    resolutionHint:
      "Reject or accept some of the existing pending suggestions before adding new ones.",
  });
  if (!limitCheck.allowed) {
    return new Err(new MCPError(limitCheck.errorMessage));
  }

  const targetsValidation = validateInstructionEditTargets(
    instructionsHtml,
    edits,
    "agent"
  );
  if (targetsValidation.isErr()) {
    return targetsValidation;
  }

  return new Ok(edits);
}

/**
 * Checks the caller may create agents and that the proposed name is valid and free, so the
 * creation can be applied later (see `validateAgentName`). Returns the trimmed name.
 */
export async function validateAgentCreation(
  auth: Authenticator,
  { name }: { name: string }
): Promise<Result<NameSuggestionType, MCPError>> {
  if (!auth.hasWorkspacePermission("create", "agent")) {
    return new Err(new MCPError("Creating agents is restricted."));
  }

  const nameValidation = await validateAgentName(auth, { name });
  if (nameValidation.isErr()) {
    return new Err(new MCPError(nameValidation.error.message));
  }

  return new Ok(nameValidation.value);
}

/**
 * Checks each tool, skill and sub-agent a new agent is created with could be added to an existing
 * agent (see `checkToolAddition`, `checkSkillAddition` and `checkSubAgentAddition`), so the creation
 * can be applied later.
 */
export async function validateAgentCreationCapabilities(
  auth: Authenticator,
  {
    toolIds,
    skillIds,
    subAgentIds,
  }: { toolIds: string[]; skillIds: string[]; subAgentIds: string[] }
): Promise<Result<undefined, MCPError>> {
  if (new Set(toolIds).size !== toolIds.length) {
    return new Err(new MCPError("Each tool can only be added once."));
  }
  if (new Set(skillIds).size !== skillIds.length) {
    return new Err(new MCPError("Each skill can only be added once."));
  }
  if (new Set(subAgentIds).size !== subAgentIds.length) {
    return new Err(new MCPError("Each sub-agent can only be added once."));
  }

  const [
    suggestableTools,
    suggestableSkills,
    suggestableSubAgents,
    runAgentTool,
  ] = await Promise.all([
    fetchSuggestableTools(auth, toolIds),
    fetchSuggestableSkills(auth, skillIds),
    fetchSuggestableSubAgents(auth, subAgentIds),
    subAgentIds.length > 0 ? fetchRunAgentTool(auth) : null,
  ]);

  for (const toolId of toolIds) {
    const addition = checkToolAddition(toolId, suggestableTools);
    if (addition.isErr()) {
      return new Err(new MCPError(addition.error));
    }
  }
  for (const skillId of skillIds) {
    const addition = checkSkillAddition(skillId, suggestableSkills);
    if (addition.isErr()) {
      return new Err(new MCPError(addition.error));
    }
  }
  if (subAgentIds.length > 0 && !runAgentTool) {
    return new Err(
      new MCPError("The tool to run sub-agents is not available.")
    );
  }
  for (const subAgentId of subAgentIds) {
    const addition = checkSubAgentAddition(subAgentId, suggestableSubAgents);
    if (addition.isErr()) {
      return new Err(new MCPError(addition.error));
    }
  }

  return new Ok(undefined);
}

/**
 * Checks each skill can be added to or removed from the agent. An added skill is one the builder
 * offers (see `checkSkillAddition`) that the agent does not have yet; a removed skill is one of the
 * agent's skills. Only editors can suggest it, as only editors can apply it. Returns one suggestion
 * per skill.
 */
export async function validateAgentSkillChanges(
  auth: Authenticator,
  agent: AgentResource,
  {
    addSkillIds,
    removeSkillIds,
  }: { addSkillIds: string[]; removeSkillIds: string[] }
): Promise<Result<SkillsSuggestionType[], MCPError>> {
  if (!isAuthorizedForAgentSuggestionKind(auth, agent, "skills")) {
    return new Err(
      new MCPError("Only editors can suggest changing an agent's skills.")
    );
  }

  if (agent.status !== "active") {
    return new Err(
      new MCPError("Only active agents can have their skills changed.")
    );
  }

  const skillIds = [...addSkillIds, ...removeSkillIds];
  if (new Set(skillIds).size !== skillIds.length) {
    return new Err(
      new MCPError("Each skill can only be added or removed once.")
    );
  }

  const currentSkillIds = new Set(
    (await agent.listSkills(auth)).map((skill) => skill.sId)
  );

  for (const skillId of removeSkillIds) {
    if (!currentSkillIds.has(skillId)) {
      return new Err(
        new MCPError(`The agent does not have the skill "${skillId}".`)
      );
    }
  }

  const suggestable = await fetchSuggestableSkills(auth, addSkillIds);
  for (const skillId of addSkillIds) {
    if (currentSkillIds.has(skillId)) {
      return new Err(
        new MCPError(`The agent already has the skill "${skillId}".`)
      );
    }
    const addition = checkSkillAddition(skillId, suggestable);
    if (addition.isErr()) {
      return new Err(new MCPError(addition.error));
    }
  }

  // No pending suggestion limit for conversational building.
  return new Ok([
    ...addSkillIds.map((skillId) => ({ action: "add" as const, skillId })),
    ...removeSkillIds.map((skillId) => ({
      action: "remove" as const,
      skillId,
    })),
  ]);
}

/**
 * Checks each tool can be added to or removed from the agent (see `checkToolAddition` and
 * `checkToolRemoval`). Only editors can suggest it, as only editors can apply it. Returns one
 * suggestion per tool.
 */
export async function validateAgentToolChanges(
  auth: Authenticator,
  agent: AgentResource,
  {
    addToolIds,
    removeToolIds,
  }: { addToolIds: string[]; removeToolIds: string[] }
): Promise<Result<ToolsSuggestionType[], MCPError>> {
  if (!isAuthorizedForAgentSuggestionKind(auth, agent, "tools")) {
    return new Err(
      new MCPError("Only editors can suggest changing an agent's tools.")
    );
  }

  if (agent.status !== "active") {
    return new Err(
      new MCPError("Only active agents can have their tools changed.")
    );
  }

  const toolIds = [...addToolIds, ...removeToolIds];
  if (new Set(toolIds).size !== toolIds.length) {
    return new Err(
      new MCPError("Each tool can only be added or removed once.")
    );
  }

  const actions = (await agent.listActions(auth)).filter(
    isServerSideMCPServerConfiguration
  );
  const suggestable = await fetchSuggestableTools(auth, toolIds);

  for (const toolId of removeToolIds) {
    const removal = checkToolRemoval(toolId, suggestable, actions);
    if (removal.isErr()) {
      return new Err(new MCPError(removal.error));
    }
  }

  for (const toolId of addToolIds) {
    if (actions.some((action) => action.mcpServerViewId === toolId)) {
      return new Err(
        new MCPError(`The agent already has the tool "${toolId}".`)
      );
    }
    const addition = checkToolAddition(toolId, suggestable);
    if (addition.isErr()) {
      return new Err(new MCPError(addition.error));
    }
  }

  // No pending suggestion limit for conversational building.
  return new Ok([
    ...addToolIds.map((toolId) => ({ action: "add" as const, toolId })),
    ...removeToolIds.map((toolId) => ({ action: "remove" as const, toolId })),
  ]);
}

/**
 * Checks each sub-agent can be added to or removed from the agent. An added sub-agent
 * is run through the `run_agent` tool, with the builder's defaults.
 * Only editors can suggest it, as only editors can apply it.
 * Returns one suggestion per sub-agent.
 */
export async function validateAgentSubAgentChanges(
  auth: Authenticator,
  agent: AgentResource,
  {
    addAgentIds,
    removeAgentIds,
  }: { addAgentIds: string[]; removeAgentIds: string[] }
): Promise<Result<SubAgentSuggestionType[], MCPError>> {
  if (!isAuthorizedForAgentSuggestionKind(auth, agent, "sub_agent")) {
    return new Err(
      new MCPError("Only editors can suggest changing an agent's sub-agents.")
    );
  }

  if (agent.status !== "active") {
    return new Err(
      new MCPError("Only active agents can have their sub-agents changed.")
    );
  }

  const subAgentIds = [...addAgentIds, ...removeAgentIds];
  if (new Set(subAgentIds).size !== subAgentIds.length) {
    return new Err(
      new MCPError("Each sub-agent can only be added or removed once.")
    );
  }

  const runAgentTool = await fetchRunAgentTool(auth);
  if (!runAgentTool) {
    return new Err(
      new MCPError("The tool to run sub-agents is not available.")
    );
  }

  const actions = (await agent.listActions(auth)).filter(
    isServerSideMCPServerConfiguration
  );
  for (const subAgentId of removeAgentIds) {
    const removal = checkSubAgentRemoval(subAgentId, actions);
    if (removal.isErr()) {
      return new Err(new MCPError(removal.error));
    }
  }

  const suggestable = await fetchSuggestableSubAgents(auth, addAgentIds);
  for (const subAgentId of addAgentIds) {
    if (actions.some((action) => action.childAgentId === subAgentId)) {
      return new Err(
        new MCPError(`The agent already has the sub-agent "${subAgentId}".`)
      );
    }
    const addition = checkSubAgentAddition(subAgentId, suggestable, {
      agentId: agent.sId,
    });
    if (addition.isErr()) {
      return new Err(new MCPError(addition.error));
    }
  }

  // No pending suggestion limit for conversational building.
  return new Ok([
    ...addAgentIds.map((childAgentId) => ({
      action: "add" as const,
      toolId: runAgentTool.sId,
      childAgentId,
    })),
    ...removeAgentIds.map((childAgentId) => ({
      action: "remove" as const,
      toolId: runAgentTool.sId,
      childAgentId,
    })),
  ]);
}

/** Kinds of which a single suggestion may be pending per agent at a time. */
export type SingletonAgentSuggestionData = Extract<
  AgentSuggestionData,
  {
    kind:
      | "name"
      | "description"
      | "scope"
      | "model"
      | "structured_output"
      | "editors"
      | "tags"
      | "delete";
  }
>;

/**
 * @cc [owner:fabiencelier,label:product] single-pending-per-singleton-kind
 * Recording suggestions of singleton kinds MUST mark every other `pending` suggestion of the same
 * kinds on the same agent `outdated`, and never the recorded ones. Concurrent calls are not
 * serialized: they can leave several pending suggestions of a kind on the agent.
 */
export async function recordSingletonAgentSuggestions(
  auth: Authenticator,
  agent: AgentResource,
  {
    data,
    analysis,
    conversation,
    batch,
  }: {
    data: SingletonAgentSuggestionData[];
    analysis: string | null;
    conversation: ConversationType;
    batch: BatchSuggestionResource | null;
  }
): Promise<AgentSuggestionResource[]> {
  if (data.length === 0) {
    return [];
  }

  // The listing may or may not see the rows inserted concurrently: they are excluded by id below.
  const [suggestions, pending] = await Promise.all([
    AgentSuggestionResource.createSuggestionsForAgent(
      auth,
      agent,
      data.map((d) => ({
        ...d,
        analysis,
        state: "pending" as const,
        conversationId: conversation.id,
        source: "conversational" as const,
        batchId: batch?.id ?? null,
      }))
    ),
    AgentSuggestionResource.listByAgentConfigurationId(auth, agent.sId, {
      states: ["pending"],
    }),
  ]);

  await pruneSupersededSingletonSuggestions(auth, {
    pending,
    recorded: suggestions,
  });

  return suggestions;
}

/**
 * @cc [owner:avervaet,label:product] no-direct-mutation
 * Recording an agent creation MUST NOT make the proposed agent usable: the proposal is recorded
 * as a `pending` `create` suggestion on a `pending`, `hidden` placeholder editable solely by the
 * caller (see `AgentResource.createPending`). No other suggestion can target that placeholder, so
 * there are no conflicting suggestions to mark `outdated`. Turning the suggestion into a usable
 * agent is a separate, human-reviewed step.
 */
export async function recordAgentCreationSuggestion(
  auth: Authenticator,
  pendingAgent: AgentResource,
  {
    create,
    analysis,
    conversation,
    batch,
  }: {
    create: CreateSuggestionType;
    analysis: string | null;
    conversation: ConversationType;
    batch: BatchSuggestionResource | null;
  }
): Promise<AgentSuggestionResource> {
  return AgentSuggestionResource.createSuggestionForAgent(auth, pendingAgent, {
    kind: "create",
    suggestion: create,
    analysis,
    state: "pending",
    conversationId: conversation.id,
    source: "conversational",
    batchId: batch?.id ?? null,
  });
}

/** Kinds of which a single suggestion may be pending per agent and per item at a time. */
export type KeyedAgentSuggestionData = Extract<
  AgentSuggestionData,
  { kind: "skills" | "tools" | "sub_agent" }
>;

/** Identifies the item a keyed suggestion targets, or null when the row is not a keyed kind. */
function keyedSuggestionItemOf(
  kind: AgentSuggestionKind,
  suggestion: unknown
): string | null {
  switch (kind) {
    case "skills":
      return isSkillsSuggestion(suggestion)
        ? `skills:${suggestion.skillId}`
        : null;
    case "tools":
      return isToolsSuggestion(suggestion)
        ? `tools:${suggestion.toolId}`
        : null;
    case "sub_agent":
      return isSubAgentSuggestion(suggestion)
        ? `sub_agent:${suggestion.childAgentId}`
        : null;
    default:
      return null;
  }
}

/**
 * @cc [owner:fabiencelier;avervaet,label:product] single-pending-per-item
 * Recording suggestions of keyed kinds MUST mark every other `pending` suggestion on the same agent
 * of the same kind and for the same item (skill, tool or sub-agent) `outdated`, and never the
 * recorded ones. Concurrent calls are not serialized: they can leave several pending suggestions
 * for an item on the agent.
 */
export async function recordKeyedAgentSuggestions(
  auth: Authenticator,
  agent: AgentResource,
  {
    data,
    conversation,
    batch,
  }: {
    data: KeyedAgentSuggestionData[];
    conversation: ConversationType;
    batch: BatchSuggestionResource | null;
  }
): Promise<AgentSuggestionResource[]> {
  if (data.length === 0) {
    return [];
  }

  const recordedItems = new Set(
    data.map((d) => keyedSuggestionItemOf(d.kind, d.suggestion))
  );
  const pending = await AgentSuggestionResource.listByAgentConfigurationId(
    auth,
    agent.sId,
    { states: ["pending"] }
  );
  await markDuplicateSuggestionsAsOutdated(auth, pending, (s) => {
    const item = keyedSuggestionItemOf(s.kind, s.suggestion);
    return item !== null && recordedItems.has(item);
  });

  return AgentSuggestionResource.createSuggestionsForAgent(
    auth,
    agent,
    data.map((d) => ({
      ...d,
      analysis: null,
      state: "pending" as const,
      conversationId: conversation.id,
      source: "conversational" as const,
      batchId: batch?.id ?? null,
    }))
  );
}
