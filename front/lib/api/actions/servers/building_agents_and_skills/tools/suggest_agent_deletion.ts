import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopRunContext } from "@app/lib/actions/types";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import {
  recordSingletonAgentSuggestion,
  validateAgentDeletion,
} from "@app/lib/api/actions/servers/building_agents_and_skills/agent_suggestion_changes";
import { formatAgentSuggestionDirective } from "@app/lib/api/actions/servers/building_agents_and_skills/directives";
import type { SuggestAgentDeletionArgs } from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import type { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";

/**
 * @cc [owner:avervaet,label:product;security] no-direct-deletion
 * `suggestAgentDeletion` MUST NOT archive or delete the agent: it only records a `pending`
 * `delete` suggestion targeting an active agent the caller could delete through the manual route
 * (editor or admin). Older pending `delete` suggestions on the same agent are marked `outdated`
 * so a single proposal is open at a time. Archiving is a separate, human-reviewed step.
 */
export async function suggestAgentDeletion(
  auth: Authenticator,
  { agentId, analysis }: SuggestAgentDeletionArgs,
  runContext: AgentLoopRunContext
): Promise<Result<AgentSuggestionResource, MCPError>> {
  if (!auth.user()) {
    return new Err(
      new MCPError(
        "Suggesting an agent deletion requires an interactive user context."
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

  const validation = validateAgentDeletion(auth, agent);
  if (validation.isErr()) {
    return validation;
  }

  return new Ok(
    await recordSingletonAgentSuggestion(auth, agent, {
      data: { kind: "delete", suggestion: validation.value },
      analysis: analysis ?? null,
      conversation: runContext.conversation,
      batch: null,
    })
  );
}

export async function suggestAgentDeletionHandler(
  args: SuggestAgentDeletionArgs,
  { auth, runContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  assert(isAgentLoopRunContext(runContext), "AgentLoopRunContext expected");

  const result = await suggestAgentDeletion(auth, args, runContext);
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
