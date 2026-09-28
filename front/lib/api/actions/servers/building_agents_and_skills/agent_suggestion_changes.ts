import { MCPError } from "@app/lib/actions/mcp_errors";
import type { InstructionSuggestionEditInput } from "@app/lib/api/assistant/agent_instructions_suggestions";
import { validateInstructionEdits } from "@app/lib/api/assistant/agent_instructions_suggestions";
import { canAddPendingSuggestions } from "@app/lib/api/assistant/agent_suggestion_limits";
import { pruneSupersededSingletonSuggestions } from "@app/lib/api/assistant/agent_suggestion_pruning";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { getAgentIdFromName } from "@app/lib/api/assistant/configuration/helpers";
import type { Authenticator } from "@app/lib/auth";
import { findUnknownTargetBlockIds } from "@app/lib/editor/instructions_block_conflict";
import { DustError } from "@app/lib/error";
import { getModelsForAuth } from "@app/lib/model_tiers/enabled_models";
import { hasSuggestionSelfConflict } from "@app/lib/reinforcement/skill_suggestion_pruning";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import type { BatchSuggestionResource } from "@app/lib/resources/batch_suggestion_resource";
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
