import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopRunContext } from "@app/lib/actions/types";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import { validateAgentInstructionsChange } from "@app/lib/api/actions/servers/building_agents_and_skills/agent_suggestion_changes";
import { formatAgentSuggestionDirective } from "@app/lib/api/actions/servers/building_agents_and_skills/directives";
import type { SuggestAgentInstructionsChangeArgs } from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import type { CreatedInstructionSuggestion } from "@app/lib/api/assistant/agent_instructions_suggestions";
import { createAgentInstructionSuggestions } from "@app/lib/api/assistant/agent_instructions_suggestions";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import assert from "assert";

export interface SuggestAgentInstructionsChangeResult {
  agentConfigurationId: string;
  suggestion: CreatedInstructionSuggestion;
}

export async function suggestAgentInstructionsChange(
  auth: Authenticator,
  { agentId, instructionEdit, analysis }: SuggestAgentInstructionsChangeArgs,
  runContext: AgentLoopRunContext
): Promise<Result<SuggestAgentInstructionsChangeResult, MCPError>> {
  if (!auth.user()) {
    return new Err(
      new MCPError(
        "Suggesting an agent instructions change requires an interactive user context."
      )
    );
  }

  const agent = await getAgentConfiguration(auth, {
    agentId,
    variant: "full",
  });
  if (!agent || (!agent.canRead && !auth.isAdmin())) {
    return new Err(new MCPError("Agent not found."));
  }

  const validation = await validateAgentInstructionsChange(auth, agent, [
    { ...instructionEdit, analysis },
  ]);
  if (validation.isErr()) {
    return validation;
  }

  const result = await createAgentInstructionSuggestions(auth, {
    agentConfiguration: agent,
    edits: validation.value,
    source: "conversational",
    conversation: runContext.conversation,
  });
  if (result.isErr()) {
    return new Err(new MCPError(result.error));
  }

  return new Ok({
    agentConfigurationId: agent.sId,
    suggestion: result.value[0],
  });
}

export async function suggestAgentInstructionsChangeHandler(
  args: SuggestAgentInstructionsChangeArgs,
  { auth, runContext }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  assert(isAgentLoopRunContext(runContext), "AgentLoopRunContext expected");

  const result = await suggestAgentInstructionsChange(auth, args, runContext);
  if (result.isErr()) {
    return result;
  }

  const { agentConfigurationId, suggestion } = result.value;
  const directive = formatAgentSuggestionDirective({
    sId: suggestion.sId,
    kind: suggestion.kind,
    _agentConfigurationId: agentConfigurationId,
  });

  return new Ok([
    {
      type: "text" as const,
      text: directive,
    },
  ]);
}
