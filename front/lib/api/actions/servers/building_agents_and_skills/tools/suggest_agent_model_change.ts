import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopRunContext } from "@app/lib/actions/types";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import {
  recordSingletonAgentSuggestion,
  validateAgentModelChange,
} from "@app/lib/api/actions/servers/building_agents_and_skills/agent_suggestion_changes";
import { formatAgentSuggestionDirective } from "@app/lib/api/actions/servers/building_agents_and_skills/directives";
import type { SuggestAgentModelChangeArgs } from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import type { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";

/**
 * @cc [owner:avervaet,label:product;security] no-direct-model-change
 * `suggestAgentModelChange` MUST NOT change the agent's model directly: it only records a
 * `pending` `model` suggestion targeting an active agent the caller could edit through the
 * manual route (editor or admin). Older pending `model` suggestions on the same agent are marked
 * `outdated` so a single proposal is open at a time. Applying the change is a separate,
 * human-reviewed step.
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

  const validation = await validateAgentModelChange(auth, agent, {
    modelId,
    reasoningEffort,
  });
  if (validation.isErr()) {
    return validation;
  }

  return new Ok(
    await recordSingletonAgentSuggestion(auth, agent, {
      data: { kind: "model", suggestion: validation.value },
      analysis: analysis ?? null,
      conversation: runContext.conversation,
      batch: null,
    })
  );
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
