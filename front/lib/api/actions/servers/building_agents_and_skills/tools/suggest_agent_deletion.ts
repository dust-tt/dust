import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { formatAgentSuggestionDirective } from "@app/lib/api/actions/servers/building_agents_and_skills/directives";
import type { SuggestAgentDeletionArgs } from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import {
  executeWithLockResult,
  isLockAcquisitionTimeoutError,
} from "@app/lib/lock";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

function getAgentDeletionSuggestionLockName(agentSId: string): string {
  return `agent-suggestion:delete:${agentSId}`;
}

/**
 * @cc [owner:avervaet,label:product;security] no-direct-deletion
 * `suggestAgentDeletion` MUST NOT archive or delete the agent: it only records a `pending`
 * `delete` suggestion targeting an active agent the caller could delete through the manual route
 * (editor or admin). Older pending `delete` suggestions on the same agent are marked `outdated`
 * so a single proposal is open at a time. Archiving is a separate, human-reviewed step. The
 * outdate-then-insert sequence runs under a per-agent lock so concurrent calls can't each find no
 * pending suggestion and both insert one.
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

  const result = await executeWithLockResult(
    getAgentDeletionSuggestionLockName(agent.sId),
    async (): Promise<Result<AgentSuggestionResource, MCPError>> => {
      const conflicting =
        await AgentSuggestionResource.listByAgentConfigurationId(
          auth,
          agent.sId,
          { states: ["pending"], kind: "delete" }
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
          kind: "delete",
          suggestion: { name: agent.name },
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
          new MCPError("Another deletion suggestion is being recorded, retry.")
        )
      : new Err(result.error);
  }

  return result;
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
      text: formatAgentSuggestionDirective(suggestion),
    },
  ]);
}
