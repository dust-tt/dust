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

/**
 * @cc [owner:avervaet,label:product;security] no-direct-deletion
 * `suggestAgentDeletion` MUST NOT archive or delete the agent: it only records a `pending`
 * `delete` suggestion targeting an active agent the caller could delete through the manual route
 * (editor or admin). Older pending `delete` suggestions on the same agent are marked `outdated`
 * so a single proposal is open at a time. Archiving is a separate, human-reviewed step.
 */
export async function suggestAgentDeletion(
  auth: Authenticator,
  { agentId, analysis }: SuggestAgentDeletionArgs
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

  if (!agent.canEdit && !auth.isAdmin()) {
    return new Err(
      new MCPError("Only editors can suggest deleting a workspace agent.")
    );
  }

  if (agent.status !== "active") {
    return new Err(new MCPError("Only active agents can be deleted."));
  }

  const conflicting = await AgentSuggestionResource.listByAgentConfigurationId(
    auth,
    agent.sId,
    { states: ["pending"], kind: "delete" }
  );
  await AgentSuggestionResource.bulkUpdateState(auth, conflicting, "outdated");

  const suggestion = await AgentSuggestionResource.createSuggestionForAgent(
    auth,
    agent,
    {
      kind: "delete",
      suggestion: { name: agent.name },
      analysis: analysis ?? null,
      state: "pending",
      conversationId: null,
    }
  );
  return new Ok(suggestion);
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
      text:
        `:agent_suggestion[]{sId=${suggestion.sId} kind=${suggestion.kind} ` +
        `agentId=${suggestion._agentConfigurationId}}`,
    },
  ]);
}
