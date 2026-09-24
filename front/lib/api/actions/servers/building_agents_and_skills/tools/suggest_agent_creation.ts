import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopRunContext } from "@app/lib/actions/types";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import {
  recordAgentCreationSuggestion,
  validateAgentCreation,
} from "@app/lib/api/actions/servers/building_agents_and_skills/agent_suggestion_changes";
import { formatAgentSuggestionDirective } from "@app/lib/api/actions/servers/building_agents_and_skills/directives";
import type { SuggestAgentCreationArgs } from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import type { Authenticator } from "@app/lib/auth";
import type { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";

export async function suggestAgentCreation(
  auth: Authenticator,
  { name, description, instructions, analysis }: SuggestAgentCreationArgs,
  runContext: AgentLoopRunContext
): Promise<Result<AgentSuggestionResource, MCPError>> {
  if (!auth.user()) {
    return new Err(
      new MCPError(
        "Suggesting a new agent requires an interactive user context."
      )
    );
  }

  const validation = await validateAgentCreation(auth, { name });
  if (validation.isErr()) {
    return validation;
  }

  return recordAgentCreationSuggestion(auth, {
    create: { name: validation.value.name, description, instructions },
    analysis: analysis ?? null,
    conversation: runContext.conversation,
    batch: null,
  });
}

export async function suggestAgentCreationHandler(
  args: SuggestAgentCreationArgs,
  { auth, runContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  assert(isAgentLoopRunContext(runContext), "AgentLoopRunContext expected");

  const result = await suggestAgentCreation(auth, args, runContext);
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
