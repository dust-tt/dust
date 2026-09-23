import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { AgentLoopRunContext } from "@app/lib/actions/types";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import { formatAgentSuggestionDirective } from "@app/lib/api/actions/servers/building_agents_and_skills/directives";
import type { SuggestAgentNameArgs } from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { getAgentIdFromName } from "@app/lib/api/assistant/configuration/helpers";
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
import assert from "assert";

function getAgentNameSuggestionLockName(agentId: string): string {
  return `agent-suggestion:name:${agentId}`;
}

async function validateAgentNameChange(
  auth: Authenticator,
  agent: LightAgentConfigurationType,
  { name }: { name: string }
): Promise<
  Result<
    {
      name: string;
    },
    DustError<"unauthorized" | "invalid_request_error" | "name_conflict">
  >
> {
  if (!agent.canEdit) {
    return new Err(
      new DustError("unauthorized", "Only editors of this agent can rename it.")
    );
  }

  if (agent.status !== "active") {
    return new Err(
      new DustError(
        "invalid_request_error",
        "Only active agents can be renamed."
      )
    );
  }

  const trimmedName = name.trim();
  if (!trimmedName) {
    return new Err(
      new DustError("invalid_request_error", "Agent name cannot be empty.")
    );
  }

  if (/\s/.test(trimmedName)) {
    return new Err(
      new DustError(
        "invalid_request_error",
        "Agent name cannot contain spaces."
      )
    );
  }

  if (trimmedName === agent.name) {
    return new Err(
      new DustError(
        "invalid_request_error",
        `The agent is already named "${agent.name}".`
      )
    );
  }

  if (await getAgentIdFromName(auth, trimmedName)) {
    return new Err(
      new DustError(
        "name_conflict",
        `An agent with the name "${trimmedName}" already exists.`
      )
    );
  }

  return new Ok({ name: trimmedName });
}

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

  const result = await executeWithLockResult(
    getAgentNameSuggestionLockName(agent.sId),
    async (): Promise<Result<AgentSuggestionResource, MCPError>> => {
      const conflicting =
        await AgentSuggestionResource.listByAgentConfigurationId(
          auth,
          agent.sId,
          { states: ["pending"], kind: "name" }
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
          kind: "name",
          suggestion: { name: validation.value.name },
          analysis: analysis ?? null,
          state: "pending",
          conversationId: runContext.conversation.id,
          source: "conversational",
        }
      );
      return new Ok(suggestion);
    }
  );

  if (result.isErr()) {
    return isLockAcquisitionTimeoutError(result.error)
      ? new Err(
          new MCPError("Another rename suggestion is being recorded, retry.")
        )
      : new Err(result.error);
  }

  return result;
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
