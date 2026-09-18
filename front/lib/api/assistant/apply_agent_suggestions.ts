import { DROID_AVATAR_URLS } from "@app/lib/agent_builder/avatars";
import { createOrUpgradeAgentConfiguration } from "@app/lib/api/assistant/configuration/create_or_upgrade";
import { getAgentsEditors } from "@app/lib/api/assistant/editors";
import type { Authenticator } from "@app/lib/auth";
import {
  applyInstructionEditsToHtml,
  convertMarkdownToBlockHtml,
} from "@app/lib/editor/skill_instructions_html";
import { DustError } from "@app/lib/error";
import { getModelsForAuth } from "@app/lib/model_tiers/enabled_models";
import type { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { CreateSuggestionType } from "@app/types/suggestions/agent_suggestion";
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

/**
 * Applies approved conversational suggestions to the agent they target. Only `create` is applied
 * today; every other kind is rejected so the caller does not mark as approved a change that was
 * never made.
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
  for (const suggestion of suggestions) {
    const data = parseAgentSuggestionData({
      kind: suggestion.kind,
      suggestion: suggestion.suggestion,
    });

    switch (data.kind) {
      case "create": {
        const res = await applyCreateSuggestion(auth, agent, data.suggestion);
        if (res.isErr()) {
          return res;
        }
        break;
      }

      case "instructions":
      case "tools":
      case "sub_agent":
      case "skills":
      case "model":
      case "knowledge":
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

  return new Ok(undefined);
}
