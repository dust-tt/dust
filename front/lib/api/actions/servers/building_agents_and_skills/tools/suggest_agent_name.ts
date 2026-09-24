import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopRunContext } from "@app/lib/actions/types";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import {
  recordSingletonAgentSuggestion,
  validateAgentNameChange,
} from "@app/lib/api/actions/servers/building_agents_and_skills/agent_suggestion_changes";
import { formatAgentSuggestionDirective } from "@app/lib/api/actions/servers/building_agents_and_skills/directives";
import type { SuggestAgentNameArgs } from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import type { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";

export async function suggestAgentName(
  auth: Authenticator,
  { agentId, name, analysis }: SuggestAgentNameArgs,
  runContext: AgentLoopRunContext
): Promise<Result<AgentSuggestionResource, MCPError>> {
  const agent = await getAgentConfiguration(auth, {
    agentId,
    variant: "light",
  });
  if (!agent || !agent.canRead) {
    return new Err(new MCPError("Agent not found."));
  }

  const validation = await validateAgentNameChange(auth, agent, { name });
  if (validation.isErr()) {
    return new Err(new MCPError(validation.error.message));
  }

  return new Ok(
    await recordSingletonAgentSuggestion(auth, agent, {
      data: { kind: "name", suggestion: validation.value },
      analysis: analysis ?? null,
      conversation: runContext.conversation,
      batch: null,
    })
  );
}

export async function suggestAgentNameHandler(
  args: SuggestAgentNameArgs,
  { auth, runContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  assert(isAgentLoopRunContext(runContext), "AgentLoopRunContext expected");

  const result = await suggestAgentName(auth, args, runContext);
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
