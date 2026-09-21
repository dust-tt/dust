import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { formatAgentSuggestionDirective } from "@app/lib/api/actions/servers/building_agents_and_skills/directives";
import type { SuggestAgentModelChangeArgs } from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { getAvailableModelsForWorkspace } from "@app/lib/api/assistant/workspace_capabilities";
import type { Authenticator } from "@app/lib/auth";
import {
  executeWithLockResult,
  isLockAcquisitionTimeoutError,
} from "@app/lib/lock";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import { getAvailableReasoningEfforts } from "@app/types/assistant/models/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

function getAgentModelSuggestionLockName(agentSId: string): string {
  return `agent-suggestion:model:${agentSId}`;
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
  { agentId, modelId, reasoningEffort, analysis }: SuggestAgentModelChangeArgs
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

  const availableModels = await getAvailableModelsForWorkspace(auth);
  const modelConfiguration = availableModels.find((m) => m.modelId === modelId);
  if (!modelConfiguration) {
    return new Err(
      new MCPError(
        `Invalid model ID: ${modelId}. Available models: ` +
          `${availableModels.map((m) => m.modelId).join(", ")}.`
      )
    );
  }

  if (reasoningEffort) {
    const supportedReasoningEfforts = getAvailableReasoningEfforts(
      modelConfiguration.supportedReasoningEfforts
    );
    if (!supportedReasoningEfforts.includes(reasoningEffort)) {
      return new Err(
        new MCPError(
          `Invalid reasoning effort "${reasoningEffort}" for model ${modelId}. ` +
            `Supported reasoning efforts for this model: ${supportedReasoningEfforts.join(", ")}.`
        )
      );
    }
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
          conversationId: null,
          source: "conversational",
        }
      );
      return new Ok(suggestion);
    }
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
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const result = await suggestAgentModelChange(auth, args);
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
