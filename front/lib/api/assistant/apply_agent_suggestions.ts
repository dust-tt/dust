import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import { DROID_AVATAR_URLS } from "@app/lib/agent_builder/avatars";
import {
  archiveAgentConfiguration,
  getAgentConfiguration,
} from "@app/lib/api/assistant/configuration/agent";
import { getAgentConfigurationContext } from "@app/lib/api/assistant/configuration/context";
import { createOrUpgradeAgentConfiguration } from "@app/lib/api/assistant/configuration/create_or_upgrade";
import { resolveAgentModelChange } from "@app/lib/api/assistant/configuration/model_update";
import { getAgentsEditors } from "@app/lib/api/assistant/editors";
import type { Authenticator } from "@app/lib/auth";
import {
  applyInstructionEditsToHtml,
  convertMarkdownToBlockHtml,
} from "@app/lib/editor/skill_instructions_html";
import { DustError } from "@app/lib/error";
import { getModelsForAuth } from "@app/lib/model_tiers/enabled_models";
import { AgentResource } from "@app/lib/resources/agent_resource";
import type { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
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
  INSTRUCTIONS_ROOT_TARGET_BLOCK_ID,
  parseAgentSuggestionData,
} from "@app/types/suggestions/agent_suggestion";

type ApplyAgentSuggestionsError = DustError<"invalid_request_error">;

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
/**
 * @cc [owner:fabiencelier,label:security] create-requires-capability
 * Applying a `create` suggestion MUST fail with `invalid_request_error` when the caller no longer
 * holds the workspace `create` capability on agents. The capability was checked when the
 * placeholder was created, but `createAgentConfiguration` skips that check for an existing row, so
 * this is the only place it is re-verified against live state.
 */
async function applyCreateSuggestion(
  auth: Authenticator,
  agent: LightAgentConfigurationType,
  { name, description, instructions }: CreateSuggestionType
): Promise<Result<undefined, ApplyAgentSuggestionsError>> {
  if (agent.status !== "pending") {
    return new Err(
      new DustError(
        "invalid_request_error",
        "The agent this suggestion targets has already been created."
      )
    );
  }

  if (!(await auth.hasWorkspacePermission("create", "agent"))) {
    return new Err(
      new DustError("invalid_request_error", "Creating agents is restricted.")
    );
  }

  // Editor access is not re-checked here: the route only reaches this point for `agent.canEdit`
  // callers, and `createAgentConfiguration` refuses to update a pending agent owned by someone
  // else.

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

  const [editorsByAgentId, { defaultModel }] = await Promise.all([
    getAgentsEditors(auth, [agent]),
    getModelsForAuth(auth),
  ]);
  const editors = editorsByAgentId[agent.sId] ?? [];

  const res = await createOrUpgradeAgentConfiguration({
    auth,
    agentConfigurationId: agent.sId,
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
  if (res.isErr()) {
    return new Err(new DustError("invalid_request_error", res.error.message));
  }

  return new Ok(undefined);
}

async function applyDeleteSuggestion(
  auth: Authenticator,
  agent: LightAgentConfigurationType
): Promise<Result<undefined, ApplyAgentSuggestionsError>> {
  if (agent.status !== "active") {
    return new Err(
      new DustError(
        "invalid_request_error",
        "Only an active agent can be deleted."
      )
    );
  }

  // Editor access is enforced by the route (`agent.canEdit`), matching the manual DELETE route.
  const archived = await archiveAgentConfiguration(auth, agent.sId);
  if (!archived) {
    return new Err(
      new DustError(
        "invalid_request_error",
        "The agent this suggestion targets was not found."
      )
    );
  }

  return new Ok(undefined);
}

/** The agent fields a batch of accepted suggestions changes, written as one new version. */
interface AgentFieldEdits {
  name?: string;
  model?: ModelSuggestionType;
  description?: string;
}

/**
 * What one accepted suggestion asks for. `create` and `archive` are not field edits: they are
 * status changes written outside the version upgrade.
 */
type AgentChange =
  | { type: "create"; create: CreateSuggestionType }
  | { type: "archive" }
  | { type: "fields"; fields: AgentFieldEdits }
  | { type: "instructions"; instructions: InstructionsSuggestionSchemaType };

function changeForSuggestion(
  suggestion: AgentSuggestionResource
): Result<AgentChange, ApplyAgentSuggestionsError> {
  const data = parseAgentSuggestionData({
    kind: suggestion.kind,
    suggestion: suggestion.suggestion,
  });

  switch (data.kind) {
    case "create":
      return new Ok({ type: "create", create: data.suggestion });

    case "delete":
      return new Ok({ type: "archive" });

    case "model":
      return new Ok({ type: "fields", fields: { model: data.suggestion } });

    case "name":
      return new Ok({ type: "fields", fields: { name: data.suggestion.name } });

    case "description":
      return new Ok({
        type: "fields",
        fields: { description: data.suggestion.description },
      });
    case "instructions":
      return new Ok({ type: "instructions", instructions: data.suggestion });

    case "knowledge":
    case "skills":
    case "sub_agent":
    case "tools":
      return new Err(
        new DustError(
          "invalid_request_error",
          `Suggestions of kind "${data.kind}" cannot be applied server-side yet.`
        )
      );

    default:
      assertNever(data);
  }
}

interface AgentBatchChanges {
  create?: CreateSuggestionType;
  archive?: true;
  fields: AgentFieldEdits;
  instructions: InstructionsSuggestionSchemaType[];
}

/**
 * Folds what every accepted suggestion asks for into one set of changes, so a batch produces one
 * agent version. Instructions suggestions are block-targeted and independent of one another, so
 * every one in the batch is kept, in order, rather than merged like the other fields.
 */
function mergeAgentChanges(changes: AgentChange[]): AgentBatchChanges {
  return changes.reduce<AgentBatchChanges>(
    (merged, next) => ({
      create: next.type === "create" ? next.create : merged.create,
      archive: next.type === "archive" ? true : merged.archive,
      fields:
        next.type === "fields"
          ? { ...merged.fields, ...next.fields }
          : merged.fields,
      instructions:
        next.type === "instructions"
          ? [...merged.instructions, next.instructions]
          : merged.instructions,
    }),
    { fields: {}, instructions: [] }
  );
}

/**
 * @cc [owner:matteotrab,label:product] field-edits-carry-the-agent-over
 * `createOrUpgradeAgentConfiguration` replaces the whole agent, so every field no suggestion
 * touched MUST be carried over from its current version: a batch that only renames the agent
 * leaves everything else as it was.
 */
async function applyAgentFieldEdits(
  auth: Authenticator,
  agent: LightAgentConfigurationType,
  { name, model, description }: AgentFieldEdits
): Promise<Result<undefined, ApplyAgentSuggestionsError>> {
  const contextRes = await getAgentConfigurationContext(auth, agent.sId, {
    requireEditorGroup: true,
  });
  if (contextRes.isErr()) {
    return new Err(
      new DustError("invalid_request_error", contextRes.error.api_error.message)
    );
  }

  const { agentConfiguration, editorUsers, skills } = contextRes.value;

  // Model availability and reasoning effort support are re-validated against live state, mirroring
  // what `suggest_agent_model_change` checked when the suggestion was created. Only the resolved
  // fields change; the agent's own temperature and response format are carried over.
  let nextModel = agentConfiguration.model;
  if (model) {
    const modelRes = await resolveAgentModelChange(auth, model);
    if (modelRes.isErr()) {
      return new Err(
        new DustError("invalid_request_error", modelRes.error.message)
      );
    }

    nextModel = { ...nextModel, ...modelRes.value };
  }

  // Some skills may not be readable by the caller because of their requested spaces,
  // however in that case also the agent would be unreadable as it would request the
  // same spaces.
  const res = await createOrUpgradeAgentConfiguration({
    auth,
    agentConfigurationId: agentConfiguration.sId,
    assistant: {
      name: name ?? agentConfiguration.name,
      description: description ?? agentConfiguration.description,
      instructions: agentConfiguration.instructions,
      instructionsHtml: agentConfiguration.instructionsHtml,
      pictureUrl: agentConfiguration.pictureUrl,
      status: agentConfiguration.status,
      scope: agentConfiguration.scope,
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
  if (res.isErr()) {
    return new Err(new DustError("invalid_request_error", res.error.message));
  }

  return new Ok(undefined);
}

interface PreparedInstructionsUpdate {
  instructions: string;
  instructionsHtml: string;
}

async function prepareInstructionsSuggestion(
  auth: Authenticator,
  agent: LightAgentConfigurationType,
  edits: InstructionsSuggestionSchemaType[]
): Promise<Result<PreparedInstructionsUpdate, ApplyAgentSuggestionsError>> {
  if (agent.status !== "active") {
    return new Err(
      new DustError(
        "invalid_request_error",
        "Only an active agent can have its instructions changed."
      )
    );
  }

  // Editor access is enforced by the route, matching the manual instructions-editing route. The
  // full configuration is re-fetched because the light variant the route validated against does
  // not carry `instructionsHtml`; edits are re-applied against its live content.
  const fullAgent = await getAgentConfiguration(auth, {
    agentId: agent.sId,
    variant: "full",
  });
  if (!fullAgent || !fullAgent.instructionsHtml) {
    return new Err(
      new DustError(
        "invalid_request_error",
        "The agent this suggestion targets has no block-structured instructions."
      )
    );
  }

  const converted = applyInstructionEditsToHtml(
    fullAgent.instructionsHtml,
    edits.map(({ targetBlockId, content }) => ({ targetBlockId, content }))
  );
  if (converted.isErr()) {
    return converted;
  }

  return new Ok(converted.value);
}

async function commitInstructionsSuggestion(
  auth: Authenticator,
  agent: LightAgentConfigurationType,
  prepared: PreparedInstructionsUpdate
): Promise<Result<undefined, ApplyAgentSuggestionsError>> {
  const result = await AgentResource.bulkUpdate(auth, [agent.sId], {
    instructions: prepared.instructions,
    instructionsHtml: prepared.instructionsHtml,
  });
  if (result.updatedAgentIds.length === 0) {
    return new Err(
      new DustError(
        "invalid_request_error",
        "The agent this suggestion targets could not be updated."
      )
    );
  }

  return new Ok(undefined);
}

/**
 * @cc [owner:matteotrab,label:product] one-version-per-batch
 * Applying a batch of accepted suggestions should write at most one new agent version: every field
 * a suggestion changes is merged into a single `createOrUpgradeAgentConfiguration` call.
 */
/**
 * @cc [owner:avervaet,label:error-handling] model-and-instructions-apply-order
 * When a batch contains both field edits (name/model) and `instructions` suggestions, every
 * validation that can be performed without writing to the database (agent status, target-block
 * resolution) MUST run before either kind writes to the database, and `instructions` MUST be
 * written last. This bounds the failure window after the (non-transactional) field-edit write to
 * the `instructions` database write itself, rather than to `instructions`-specific validation.
 */
export async function applyAgentSuggestions(
  auth: Authenticator,
  {
    agent,
    suggestions,
  }: {
    agent: LightAgentConfigurationType;
    suggestions: AgentSuggestionResource[];
  }
): Promise<Result<undefined, ApplyAgentSuggestionsError>> {
  const changes: AgentChange[] = [];

  for (const suggestion of suggestions) {
    const change = changeForSuggestion(suggestion);
    if (change.isErr()) {
      return change;
    }

    changes.push(change.value);
  }

  const { create, archive, fields, instructions } = mergeAgentChanges(changes);
  const hasFieldEdits = Object.keys(fields).length > 0;

  // Instructions are validated (but not written) before the field edits are written, and only
  // written once the field-edit write succeeds: see `model-and-instructions-apply-order` above.
  let preparedInstructions: PreparedInstructionsUpdate | undefined;
  if (instructions.length > 0) {
    const prepared = await prepareInstructionsSuggestion(
      auth,
      agent,
      instructions
    );
    if (prepared.isErr()) {
      return prepared;
    }
    preparedInstructions = prepared.value;
  }

  if (create) {
    const res = await applyCreateSuggestion(auth, agent, create);
    if (res.isErr()) {
      return res;
    }
  }

  if (hasFieldEdits) {
    const res = await applyAgentFieldEdits(auth, agent, fields);
    if (res.isErr()) {
      return res;
    }
  }

  if (preparedInstructions) {
    const res = await commitInstructionsSuggestion(
      auth,
      agent,
      preparedInstructions
    );
    if (res.isErr()) {
      return res;
    }
  }

  if (archive) {
    const res = await applyDeleteSuggestion(auth, agent);
    if (res.isErr()) {
      return res;
    }
  }

  return new Ok(undefined);
}
