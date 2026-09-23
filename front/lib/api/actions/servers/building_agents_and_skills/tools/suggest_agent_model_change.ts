import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopRunContext } from "@app/lib/actions/types";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import { formatAgentSuggestionDirective } from "@app/lib/api/actions/servers/building_agents_and_skills/directives";
import type { SuggestAgentModelChangeArgs } from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import {
  executeWithLockResult,
  isLockAcquisitionTimeoutError,
} from "@app/lib/lock";
import { getModelsForAuth } from "@app/lib/model_tiers/enabled_models";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";

const AGENT_MODEL_SUGGESTION_LOCK_TTL_MS = 30_000;

function getAgentModelSuggestionLockName(agentId: string): string {
  return `agent-suggestion:model:${agentId}`;
}

/**
 * @cc [owner:avervaet,label:product;security] no-direct-model-change
 * `suggestAgentModelChange` MUST NOT change the agent's model directly: it only records a
 * `pending` `model` suggestion targeting an active agent the caller could edit through the
 * manual route (editor or admin). Older pending `model` suggestions on the same agent are marked
 * `outdated` so a single proposal is open at a time. Applying the change is a separate,
 * human-reviewed step. The outdate-then-insert sequence runs under a per-agent lock so
 * concurrent calls can't each find no pending suggestion and both insert one.
 */
export async function suggestAgentModelChange(
  auth: Authenticator,
  { agentId, modelId, reasoningEffort, analysis }: SuggestAgentModelChangeArgs,
  runContext: AgentLoopRunContext
): Promise<Result<AgentSuggestionResource, MCPError>> {
  if (!auth.user()) {
    return new Err(
      new MCPError(
        "Suggesting an agent model change requires an interactive user context."
      )
    );
  }

  const agent = await getAgentConfiguration(auth, {
    agentId,
    variant: "light",
  });
  if (!agent || (!agent.canRead && !auth.isAdmin())) {
    return new Err(new MCPError("Agent not found."));
  }

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

  // Match the validation `updateAgentConfigurationsModel` applies when the suggestion is
  // approved, so a suggestion that is created as pending can always be applied later.
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

  const result = await executeWithLockResult(
    getAgentModelSuggestionLockName(agent.sId),
    async (): Promise<Result<AgentSuggestionResource, MCPError>> => {
      const conflicting =
        await AgentSuggestionResource.listByAgentConfigurationId(
          auth,
          agent.sId,
          { states: ["pending"], kind: "model" }
        );
      await AgentSuggestionResource.bulkUpdateState(
        auth,
        conflicting,
        "outdated"
      );

      const suggestion = await AgentSuggestionResource.createSuggestionForAgent(
        auth,
        agent,
        {
          kind: "model",
          suggestion: { modelId, reasoningEffort },
          analysis: analysis ?? null,
          state: "pending",
          conversationId: runContext.conversation.id,
          source: "conversational",
        }
      );
      return new Ok(suggestion);
    },
    30_000,
    { lockTtlMs: AGENT_MODEL_SUGGESTION_LOCK_TTL_MS }
  );

  if (result.isErr()) {
    return isLockAcquisitionTimeoutError(result.error)
      ? new Err(
          new MCPError(
            "Another model change suggestion is being recorded, retry."
          )
        )
      : new Err(result.error);
  }

  return result;
}

export async function suggestAgentModelChangeHandler(
  args: SuggestAgentModelChangeArgs,
  { auth, runContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  assert(isAgentLoopRunContext(runContext), "AgentLoopRunContext expected");

  const result = await suggestAgentModelChange(auth, args, runContext);
  if (result.isErr()) {
    return result;
  }

  const suggestion = result.value;

  return new Ok([
    {
      type: "text" as const,
      text: formatAgentSuggestionDirective(suggestion),
    },
  ]);
}
