import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { SuggestAgentDeletionArgs } from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

/**
 * @cc [owner:avervaet,label:product] no-direct-deletion
 * `suggestAgentDeletion` MUST NOT archive the target agent itself: it only records a `pending`
 * `delete` suggestion against it. Unlike a `create` suggestion, the target here is a pre-existing,
 * potentially shared agent, so its acceptance (elsewhere, by a human reviewer) is what actually
 * archives it.
 */
export async function suggestAgentDeletion(
  auth: Authenticator,
  { agentId }: SuggestAgentDeletionArgs
): Promise<Result<AgentSuggestionResource, MCPError>> {
  const user = auth.user();
  if (!user) {
    return new Err(
      new MCPError(
        "Suggesting an agent deletion requires an interactive user context."
      )
    );
  }

  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId,
    variant: "light",
  });
  if (!agentConfiguration) {
    return new Err(new MCPError(`Agent ${agentId} not found.`));
  }

  try {
    const suggestion = await AgentSuggestionResource.createSuggestionForAgent(
      auth,
      agentConfiguration,
      {
        kind: "delete",
        suggestion: {
          agentId: agentConfiguration.sId,
          agentName: agentConfiguration.name,
        },
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

export async function suggestAgentDeletionHandler(
  args: SuggestAgentDeletionArgs,
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const result = await suggestAgentDeletion(auth, args);
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
