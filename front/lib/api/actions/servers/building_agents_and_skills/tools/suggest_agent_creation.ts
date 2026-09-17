import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { SuggestAgentCreationArgs } from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import {
  createPendingAgentConfiguration,
  getAgentConfiguration,
} from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

/**
 * @cc [owner:avervaet,label:product] no-direct-mutation
 * `suggestAgentCreation` MUST NOT make the proposed agent usable: the only agent it creates is a
 * `pending`, `hidden` placeholder editable solely by the caller, and the proposal is recorded as a
 * `pending` `create` suggestion targeting it. No other suggestion can target that placeholder, so
 * there are no conflicting suggestions to mark `outdated`. Turning the suggestion into a usable
 * agent is a separate, human-reviewed step.
 */
export async function suggestAgentCreation(
  auth: Authenticator,
  { name, description, instructions }: SuggestAgentCreationArgs
): Promise<Result<AgentSuggestionResource, MCPError>> {
  const user = auth.user();
  if (!user) {
    return new Err(
      new MCPError(
        "Suggesting a new agent requires an interactive user context."
      )
    );
  }

  if (!(await auth.hasWorkspacePermission("create", "agent"))) {
    return new Err(new MCPError("Creating agents is restricted."));
  }

  const pendingResult = await createPendingAgentConfiguration(auth);
  if (pendingResult.isErr()) {
    return new Err(new MCPError(pendingResult.error.message));
  }

  const pendingAgent = await getAgentConfiguration(auth, {
    agentId: pendingResult.value.sId,
    variant: "light",
  });
  if (!pendingAgent) {
    return new Err(
      new MCPError("Failed to load the newly created pending agent.")
    );
  }

  try {
    const suggestion = await AgentSuggestionResource.createSuggestionForAgent(
      auth,
      pendingAgent,
      {
        kind: "create",
        suggestion: { name, description, instructions },
        analysis: null,
        state: "pending",
        conversationId: null,
      }
    );
    return new Ok(suggestion);
  } catch (error) {
    return new Err(new MCPError(normalizeError(error).message));
  }
}

export async function suggestAgentCreationHandler(
  args: SuggestAgentCreationArgs,
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const result = await suggestAgentCreation(auth, args);
  if (result.isErr()) {
    return result;
  }

  const suggestion = result.value;

  return new Ok([
    {
      type: "text" as const,
      text: `:agent_suggestion[]{sId=${suggestion.sId} kind=${suggestion.kind}}`,
    },
  ]);
}
