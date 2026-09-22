import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { formatAgentSuggestionDirective } from "@app/lib/api/actions/servers/building_agents_and_skills/directives";
import type { SuggestAgentInstructionsChangeArgs } from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import type { CreatedInstructionSuggestion } from "@app/lib/api/assistant/agent_instructions_suggestions";
import { createAgentInstructionSuggestions } from "@app/lib/api/assistant/agent_instructions_suggestions";
import { canAddPendingSuggestions } from "@app/lib/api/assistant/agent_suggestion_limits";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export interface SuggestAgentInstructionsChangeResult {
  agentConfigurationSId: string;
  suggestions: CreatedInstructionSuggestion[];
}

/**
 * Shares its validation, creation and pruning with the sidekick `suggest_prompt_edits` tool
 * (`createAgentInstructionSuggestions`), so an `instructions` suggestion behaves identically
 * whether proposed from a regular conversation or from the agent builder.
 */
export async function suggestAgentInstructionsChange(
  auth: Authenticator,
  { agentId, instructionEdits, analysis }: SuggestAgentInstructionsChangeArgs
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

  if (!agent.canEdit && !auth.isAdmin()) {
    return new Err(
      new MCPError(
        "Only editors can suggest changing a workspace agent's instructions."
      )
    );
  }

  if (agent.status !== "active") {
    return new Err(
      new MCPError("Only active agents can have their instructions changed.")
    );
  }

  if (!agent.instructionsHtml) {
    return new Err(
      new MCPError(
        "This agent has no block-structured instructions, so instruction edits cannot be " +
          "targeted."
      )
    );
  }

  const pending = await AgentSuggestionResource.listByAgentConfigurationId(
    auth,
    agent.sId,
    { states: ["pending"], kind: "instructions" }
  );
  const limitCheck = canAddPendingSuggestions({
    kind: "instructions",
    newPendingCount: instructionEdits.length,
    currentPendingCount: pending.length,
    resolutionHint:
      "Reject or accept some of the existing pending suggestions before adding new ones.",
  });
  if (!limitCheck.allowed) {
    return new Err(new MCPError(limitCheck.errorMessage));
  }

  const result = await createAgentInstructionSuggestions(auth, {
    agentConfiguration: agent,
    edits: instructionEdits.map((edit) => ({ ...edit, analysis })),
    source: "conversational",
    conversationId: null,
  });
  if (result.isErr()) {
    return new Err(new MCPError(result.error));
  }

  return new Ok({
    agentConfigurationSId: agent.sId,
    suggestions: result.value,
  });
}

export async function suggestAgentInstructionsChangeHandler(
  args: SuggestAgentInstructionsChangeArgs,
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const result = await suggestAgentInstructionsChange(auth, args);
  if (result.isErr()) {
    return result;
  }

  const { agentConfigurationSId, suggestions } = result.value;
  const directives = suggestions.map((suggestion) =>
    formatAgentSuggestionDirective({
      sId: suggestion.sId,
      kind: suggestion.kind,
      _agentConfigurationId: agentConfigurationSId,
    })
  );

  return new Ok([
    {
      type: "text" as const,
      text: directives.join("\n\n"),
    },
  ]);
}
