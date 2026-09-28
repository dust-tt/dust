import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import { DROID_AVATAR_URLS } from "@app/lib/agent_builder/avatars";
import { getAgentConfigurationContext } from "@app/lib/api/assistant/configuration/context";
import { createOrUpgradeAgentConfiguration } from "@app/lib/api/assistant/configuration/create_or_upgrade";
import { resolveAgentModelChange } from "@app/lib/api/assistant/configuration/model_update";
import type { Authenticator } from "@app/lib/auth";
import type { AgentFieldEdits } from "@app/lib/editor/merge_agent_suggestion_changes";
import { mergeAgentFieldEdits } from "@app/lib/editor/merge_agent_suggestion_changes";
import {
  applyInstructionEditsToHtml,
  convertMarkdownToBlockHtml,
} from "@app/lib/editor/skill_instructions_html";
import { DustError } from "@app/lib/error";
import { getModelsForAuth } from "@app/lib/model_tiers/enabled_models";
import { AgentResource } from "@app/lib/resources/agent_resource";
import type { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import type { AgentConfigurationAssistantPayload } from "@app/types/api/agent_configuration";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type {
  CreateSuggestionType,
  InstructionsSuggestionSchemaType,
  ModelSuggestionType,
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
      type: "create" | "edit";
      agentId: string;
      assistant: AgentConfigurationAssistantPayload;
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
 * the suggested name, description and instructions. Applying it to an agent that is not `pending`
 * fails with `invalid_request_error` and changes nothing.
 */
async function resolveCreateSuggestion(
  auth: Authenticator,
  agent: AgentResource,
  { name, description, instructions }: CreateSuggestionType
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
    convertMarkdownToBlockHtml(""),
    [
      {
        targetBlockId: INSTRUCTIONS_ROOT_TARGET_BLOCK_ID,
        content: instructions,
      },
    ]
  );
  if (converted.isErr()) {
    return converted;
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
      actions: [],
      skills: [],
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
    edits.map(({ targetBlockId, content }) => ({ targetBlockId, content }))
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

/**
 * @cc [owner:matteotrab,label:product] field-edits-carry-the-agent-over
 * `createOrUpgradeAgentConfiguration` replaces the whole agent, so every field no suggestion
 * touched MUST be carried over from its current version: a batch that only renames the agent
 * leaves everything else as it was.
 */
async function resolveAgentFieldEdits(
  auth: Authenticator,
  agent: AgentResource,
  { name, model, description, scope, instructions }: AgentFieldEdits
): Promise<Result<ResolvedAgentChange, ApplyAgentSuggestionsError>> {
  const contextRes = await getAgentConfigurationContext(auth, agent.sId, {
    requireEditorGroup: true,
  });
  if (contextRes.isErr()) {
    return new Err(
      new DustError("invalid_request_error", contextRes.error.api_error.message)
    );
  }

  const { agentConfiguration, editorUsers, skills } = contextRes.value;

  const resolvedInstructions = resolveInstructionsEdits(
    agentConfiguration,
    instructions ?? []
  );
  if (resolvedInstructions.isErr()) {
    return resolvedInstructions;
  }
  const {
    instructions: nextInstructions,
    instructionsHtml: nextInstructionsHtml,
  } = resolvedInstructions.value;

  const resolvedModel = await resolveModelEdit(
    auth,
    agentConfiguration.model,
    model
  );
  if (resolvedModel.isErr()) {
    return resolvedModel;
  }
  const nextModel = resolvedModel.value;

  // Some skills may not be readable by the caller because of their requested spaces,
  // however in that case also the agent would be unreadable as it would request the
  // same spaces.
  return new Ok({
    type: "edit",
    agentId: agentConfiguration.sId,
    assistant: {
      name: name ?? agentConfiguration.name,
      description: description ?? agentConfiguration.description,
      instructions: nextInstructions,
      instructionsHtml: nextInstructionsHtml,
      pictureUrl: agentConfiguration.pictureUrl,
      status: agentConfiguration.status,
      scope: scope ?? agentConfiguration.scope,
      model: nextModel,
      actions: agentConfiguration.actions.filter(
        isServerSideMCPServerConfiguration
      ),
      templateId: agentConfiguration.templateId,
      tags: agentConfiguration.tags,
      editors: editorUsers.map((user) => ({ sId: user.sId })),
      skills: skills.map((skill) => ({ sId: skill.sId })),
      additionalRequestedSpaceIds: agentConfiguration.requestedSpaceIds,
    },
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
      const edits = mergeAgentFieldEdits(suggestions);
      if (edits.isErr()) {
        return edits;
      }
      return resolveAgentFieldEdits(auth, agent, edits.value);
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

export async function writeAgentChange(
  auth: Authenticator,
  change: ResolvedAgentChange
): Promise<Result<undefined, ApplyAgentSuggestionsError>> {
  switch (change.type) {
    case "create":
    case "edit": {
      const res = await createOrUpgradeAgentConfiguration({
        auth,
        agentConfigurationId: change.agentId,
        assistant: change.assistant,
      });
      if (res.isErr()) {
        return new Err(
          new DustError("invalid_request_error", res.error.message)
        );
      }
      return new Ok(undefined);
    }
    case "delete":
      return archiveAgent(auth, change.agentId);
    default:
      return assertNever(change);
  }
}

/**
 * @cc [owner:matteotrab,label:security] callers-authorize-suggestions
 * Callers MUST authorize `suggestions` with `isAuthorizedToApplyAgentSuggestions` against the live
 * `agent` before calling this. Permissions are not re-checked here, and the write path does not
 * re-check the workspace `create` capability when it saves the existing `pending` placeholder.
 */
export async function applyAgentSuggestions(
  auth: Authenticator,
  params: {
    agent: AgentResource;
    suggestions: AgentSuggestionResource[];
  }
): Promise<Result<undefined, ApplyAgentSuggestionsError>> {
  const change = await resolveAgentSuggestions(auth, params);
  if (change.isErr()) {
    return change;
  }

  return writeAgentChange(auth, change.value);
}
