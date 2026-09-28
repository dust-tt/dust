import { MCPError } from "@app/lib/actions/mcp_errors";
import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import type { InstructionSuggestionEditInput } from "@app/lib/api/assistant/agent_instructions_suggestions";
import { validateInstructionEdits } from "@app/lib/api/assistant/agent_instructions_suggestions";
import { canAddPendingSuggestions } from "@app/lib/api/assistant/agent_suggestion_limits";
import {
  markDuplicateSuggestionsAsOutdated,
  pruneSupersededSingletonSuggestions,
} from "@app/lib/api/assistant/agent_suggestion_pruning";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { getAgentIdFromName } from "@app/lib/api/assistant/configuration/helpers";
import {
  checkSkillAddition,
  fetchSuggestableSkills,
} from "@app/lib/api/assistant/suggestable_skills";
import {
  checkToolAddition,
  checkToolRemoval,
  fetchSuggestableTools,
} from "@app/lib/api/assistant/suggestable_tools";
import type { Authenticator } from "@app/lib/auth";
import { findUnknownTargetBlockIds } from "@app/lib/editor/instructions_block_conflict";
import { DustError } from "@app/lib/error";
import { getModelsForAuth } from "@app/lib/model_tiers/enabled_models";
import { hasSuggestionSelfConflict } from "@app/lib/reinforcement/skill_suggestion_pruning";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import type { BatchSuggestionResource } from "@app/lib/resources/batch_suggestion_resource";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type {
  AgentConfigurationType,
  LightAgentConfigurationType,
} from "@app/types/assistant/agent";
import type { ConversationType } from "@app/types/assistant/conversation";
import type {
  ModelIdType,
  ReasoningEffort,
} from "@app/types/assistant/models/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type {
  AgentSuggestionData,
  CreateSuggestionType,
  DeleteSuggestionType,
  DescriptionSuggestionType,
  ModelSuggestionType,
  NameSuggestionType,
  ScopeSuggestionType,
  SkillsSuggestionType,
  ToolsSuggestionType,
} from "@app/types/suggestions/agent_suggestion";
import {
  isSkillsSuggestion,
  isToolsSuggestion,
} from "@app/types/suggestions/agent_suggestion";

// Validators shared by the single-change `suggest_agent_*` tools and the `suggest` tool. They run
// against live state and never write, so a batch can validate every change before recording any.

export async function validateAgentNameChange(
  auth: Authenticator,
  agent: LightAgentConfigurationType,
  { name }: { name: string }
): Promise<
  Result<
    NameSuggestionType,
    DustError<"unauthorized" | "invalid_request_error" | "name_conflict">
  >
> {
  if (!agent.canEdit) {
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
  if (!trimmedName) {
    return new Err(
      new DustError("invalid_request_error", "Agent name cannot be empty.")
    );
  }

  if (/\s/.test(trimmedName)) {
    return new Err(
      new DustError(
        "invalid_request_error",
        "Agent name cannot contain spaces."
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
  agent: LightAgentConfigurationType,
  { description }: { description: string }
): Result<
  DescriptionSuggestionType,
  DustError<"unauthorized" | "invalid_request_error">
> {
  if (!agent.canEdit) {
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
  agent: LightAgentConfigurationType,
  { scope }: { scope: "hidden" | "visible" }
): Result<
  ScopeSuggestionType,
  DustError<"unauthorized" | "invalid_request_error">
> {
  if (!agent.canEdit) {
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
 * Matches the validation `updateAgentConfigurationsModel` applies when the suggestion is approved,
 * so a suggestion that is created as pending can always be applied later.
 */
export async function validateAgentModelChange(
  auth: Authenticator,
  agent: LightAgentConfigurationType,
  {
    modelId,
    reasoningEffort,
  }: { modelId: ModelIdType; reasoningEffort?: ReasoningEffort }
): Promise<Result<ModelSuggestionType, MCPError>> {
  if (!agent.canEdit && !auth.isAdmin()) {
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

  const { models } = await getModelsForAuth(auth);
  const modelConfiguration = models.find((m) => m.modelId === modelId);
  if (!modelConfiguration || !modelConfiguration.isSelectable) {
    return new Err(
      new MCPError(
        `Invalid model ID: ${modelId}. Available models: ` +
          `${models
            .filter((m) => m.isSelectable)
            .map((m) => m.modelId)
            .join(", ")}.`
      )
    );
  }

  if (
    reasoningEffort &&
    !modelConfiguration.supportedReasoningEfforts[reasoningEffort]
  ) {
    return new Err(
      new MCPError(
        `Model "${modelId}" does not support the "${reasoningEffort}" reasoning effort.`
      )
    );
  }

  return new Ok({ modelId, reasoningEffort });
}

export function validateAgentDeletion(
  auth: Authenticator,
  agent: LightAgentConfigurationType
): Result<DeleteSuggestionType, MCPError> {
  if (!agent.canEdit && !auth.isAdmin()) {
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
  agent: AgentConfigurationType,
  edits: InstructionSuggestionEditInput[]
): Promise<Result<InstructionSuggestionEditInput[], MCPError>> {
  if (!agent.canEdit && !auth.isAdmin()) {
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

  if (!agent.instructionsHtml) {
    return new Err(
      new MCPError(
        "This agent has no block-structured instructions, so instruction edits cannot be " +
          "targeted."
      )
    );
  }

  const unknownBlockIds = findUnknownTargetBlockIds(
    agent.instructionsHtml,
    edits.map((edit) => edit.targetBlockId)
  );
  if (unknownBlockIds.length > 0) {
    return new Err(
      new MCPError(
        `These blocks do not exist in the agent's instructions: ${unknownBlockIds.join(", ")}.`
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

  const editsValidation = validateInstructionEdits(edits);
  if (editsValidation.isErr()) {
    return new Err(new MCPError(editsValidation.error));
  }

  if (
    hasSuggestionSelfConflict(
      { instructionEdits: edits },
      agent.instructionsHtml
    )
  ) {
    return new Err(
      new MCPError(
        "The suggested instruction edits overlap (a block and one of its descendants are " +
          "both targeted). Target each region of the instructions only once."
      )
    );
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
 * Checks each skill can be added to or removed from the agent. An added skill is one the builder
 * offers (see `checkSkillAddition`) that the agent does not have yet; a removed skill is one of the
 * agent's skills. Only editors can suggest it, as only editors can apply it. Returns one suggestion
 * per skill.
 */
export async function validateAgentSkillChanges(
  auth: Authenticator,
  agent: AgentConfigurationType,
  {
    addSkillIds,
    removeSkillIds,
  }: { addSkillIds: string[]; removeSkillIds: string[] }
): Promise<Result<SkillsSuggestionType[], MCPError>> {
  if (!agent.canEdit) {
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
    (await SkillResource.listByAgentConfiguration(auth, agent)).map(
      (skill) => skill.sId
    )
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
  agent: AgentConfigurationType,
  {
    addToolIds,
    removeToolIds,
  }: { addToolIds: string[]; removeToolIds: string[] }
): Promise<Result<ToolsSuggestionType[], MCPError>> {
  if (!agent.canEdit) {
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

  const actions = agent.actions.filter(isServerSideMCPServerConfiguration);
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

function isSupersededToolSuggestion(
  suggestion: AgentSuggestionResource,
  toolIds: Set<string>
): boolean {
  return (
    isToolsSuggestion(suggestion.suggestion) &&
    toolIds.has(suggestion.suggestion.toolId)
  );
}

/** Kinds of which a single suggestion may be pending per agent at a time. */
export type SingletonAgentSuggestionData = Extract<
  AgentSuggestionData,
  { kind: "name" | "description" | "scope" | "model" | "delete" }
>;

/**
 * @cc [owner:fabiencelier,label:product] single-pending-per-singleton-kind
 * Recording suggestions of singleton kinds MUST mark every other `pending` suggestion of the same
 * kinds on the same agent `outdated`, and never the recorded ones. Concurrent calls are not
 * serialized: they can leave several pending suggestions of a kind on the agent.
 */
export async function recordSingletonAgentSuggestions(
  auth: Authenticator,
  agent: LightAgentConfigurationType,
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

export async function recordSingletonAgentSuggestion(
  auth: Authenticator,
  agent: LightAgentConfigurationType,
  {
    data,
    analysis,
    conversation,
    batch,
  }: {
    data: SingletonAgentSuggestionData;
    analysis: string | null;
    conversation: ConversationType;
    batch: BatchSuggestionResource | null;
  }
): Promise<AgentSuggestionResource> {
  const [suggestion] = await recordSingletonAgentSuggestions(auth, agent, {
    data: [data],
    analysis,
    conversation,
    batch,
  });

  return suggestion;
}

/**
 * @cc [owner:avervaet,label:product] no-direct-mutation
 * Recording an agent creation MUST NOT make the proposed agent usable: the only agent it creates
 * is a `pending`, `hidden` placeholder editable solely by the caller, and the proposal is recorded
 * as a `pending` `create` suggestion targeting it. No other suggestion can target that
 * placeholder, so there are no conflicting suggestions to mark `outdated`. Turning the suggestion
 * into a usable agent is a separate, human-reviewed step.
 */
export async function recordAgentCreationSuggestion(
  auth: Authenticator,
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
): Promise<Result<AgentSuggestionResource, MCPError>> {
  const pendingResult = await AgentResource.createPending(auth);
  if (pendingResult.isErr()) {
    return new Err(new MCPError(pendingResult.error.message));
  }

  const pendingAgent = await getAgentConfiguration(auth, {
    agentId: pendingResult.value.sId,
    variant: "light",
  });
  if (!pendingAgent) {
    return new Err(
      new MCPError("Failed to load the newly created pending agent.")
    );
  }

  const suggestion = await AgentSuggestionResource.createSuggestionForAgent(
    auth,
    pendingAgent,
    {
      kind: "create",
      suggestion: create,
      analysis,
      state: "pending",
      conversationId: conversation.id,
      source: "conversational",
      batchId: batch?.id ?? null,
    }
  );
  return new Ok(suggestion);
}

/**
 * @cc [owner:fabiencelier,label:product] single-pending-per-skill
 * Recording skill suggestions MUST mark every other `pending` skill suggestion on the same agent
 * and for the same skill `outdated`, and never the recorded ones, like sidekick's
 * `suggest_skills`.
 */
export async function recordAgentSkillSuggestions(
  auth: Authenticator,
  agent: LightAgentConfigurationType,
  {
    skills,
    conversation,
    batch,
  }: {
    skills: SkillsSuggestionType[];
    conversation: ConversationType;
    batch: BatchSuggestionResource | null;
  }
): Promise<AgentSuggestionResource[]> {
  if (skills.length === 0) {
    return [];
  }

  const skillIds = new Set(skills.map((s) => s.skillId));
  const pending = await AgentSuggestionResource.listByAgentConfigurationId(
    auth,
    agent.sId,
    { states: ["pending"], kind: "skills" }
  );
  await markDuplicateSuggestionsAsOutdated(
    auth,
    pending,
    (s) =>
      isSkillsSuggestion(s.suggestion) && skillIds.has(s.suggestion.skillId)
  );

  return AgentSuggestionResource.createSuggestionsForAgent(
    auth,
    agent,
    skills.map((suggestion) => ({
      kind: "skills" as const,
      suggestion,
      analysis: null,
      state: "pending" as const,
      conversationId: conversation.id,
      source: "conversational" as const,
      batchId: batch?.id ?? null,
    }))
  );
}

/**
 * @cc [owner:fabiencelier,label:product] single-pending-per-tool
 * Recording tool suggestions MUST mark every other `pending` tool suggestion on the same agent and
 * for the same tool `outdated`, and never the recorded ones, like sidekick's `suggest_tools`.
 */
export async function recordAgentToolSuggestions(
  auth: Authenticator,
  agent: LightAgentConfigurationType,
  {
    tools,
    conversation,
    batch,
  }: {
    tools: ToolsSuggestionType[];
    conversation: ConversationType;
    batch: BatchSuggestionResource | null;
  }
): Promise<AgentSuggestionResource[]> {
  if (tools.length === 0) {
    return [];
  }

  const toolIds = new Set(tools.map((t) => t.toolId));
  const pending = await AgentSuggestionResource.listByAgentConfigurationId(
    auth,
    agent.sId,
    { states: ["pending"], kind: "tools" }
  );
  await markDuplicateSuggestionsAsOutdated(auth, pending, (s) =>
    isSupersededToolSuggestion(s, toolIds)
  );

  return AgentSuggestionResource.createSuggestionsForAgent(
    auth,
    agent,
    tools.map((suggestion) => ({
      kind: "tools" as const,
      suggestion,
      analysis: null,
      state: "pending" as const,
      conversationId: conversation.id,
      source: "conversational" as const,
      batchId: batch?.id ?? null,
    }))
  );
}
