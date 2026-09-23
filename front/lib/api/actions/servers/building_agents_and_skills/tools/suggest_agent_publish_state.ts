import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { formatAgentSuggestionDirective } from "@app/lib/api/actions/servers/building_agents_and_skills/directives";
import type { SuggestAgentPublishStateArgs } from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import {
  executeWithLockResult,
  isLockAcquisitionTimeoutError,
} from "@app/lib/lock";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

function getAgentPublishStateSuggestionLockName(agentId: string): string {
  return `agent-suggestion:scope:${agentId}`;
}

async function validateAgentPublishStateChange(
  agent: LightAgentConfigurationType,
  { scope }: { scope: "hidden" | "visible" }
): Promise<
  Result<
    {
      scope: "hidden" | "visible";
    },
    DustError<"unauthorized" | "invalid_request_error">
  >
> {
  if (!agent.canEdit) {
    return new Err(
      new DustError(
        "unauthorized",
        "Only editors of this agent can change its publish state."
      )
    );
  }

  if (agent.status !== "active") {
    return new Err(
      new DustError(
        "invalid_request_error",
        "Only active agents can have their publish state changed."
      )
    );
  }

  if (scope === agent.scope) {
    return new Err(
      new DustError(
        "invalid_request_error",
        scope === "visible"
          ? "The agent is already published."
          : "The agent is already unpublished."
      )
    );
  }

  return new Ok({ scope });
}

export async function suggestAgentPublishState(
  auth: Authenticator,
  { agentId, scope, analysis }: SuggestAgentPublishStateArgs
): Promise<Result<AgentSuggestionResource, MCPError>> {
  const agent = await getAgentConfiguration(auth, {
    agentId,
    variant: "light",
  });
  if (!agent || !agent.canRead) {
    return new Err(new MCPError("Agent not found."));
  }

  const validation = await validateAgentPublishStateChange(agent, { scope });
  if (validation.isErr()) {
    return new Err(new MCPError(validation.error.message));
  }

  const result = await executeWithLockResult(
    getAgentPublishStateSuggestionLockName(agent.sId),
    async (): Promise<Result<AgentSuggestionResource, MCPError>> => {
      const conflicting =
        await AgentSuggestionResource.listByAgentConfigurationId(
          auth,
          agent.sId,
          { states: ["pending"], kind: "scope" }
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
          kind: "scope",
          suggestion: { scope: validation.value.scope },
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
          new MCPError(
            "Another publish state suggestion is being recorded, retry."
          )
        )
      : new Err(result.error);
  }

  return result;
}

export async function suggestAgentPublishStateHandler(
  args: SuggestAgentPublishStateArgs,
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const result = await suggestAgentPublishState(auth, args);
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
