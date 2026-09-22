import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { formatAgentSuggestionDirective } from "@app/lib/api/actions/servers/building_agents_and_skills/directives";
import type { SuggestAgentDescriptionArgs } from "@app/lib/api/actions/servers/building_agents_and_skills/metadata";
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import { DustError } from "@app/lib/error";
import { AgentSuggestionResource } from "@app/lib/resources/agent_suggestion_resource";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

async function validateAgentDescriptionChange(
  agent: LightAgentConfigurationType,
  { description }: { description: string }
): Promise<
  Result<
    {
      description: string;
    },
    DustError<"unauthorized" | "invalid_request_error">
  >
> {
  if (!agent.canEdit) {
    return new Err(
      new DustError(
        "unauthorized",
        "Only editors of this agent can change its description."
      )
    );
  }

  if (agent.status !== "active") {
    return new Err(
      new DustError(
        "invalid_request_error",
        "Only active agents can have their description changed."
      )
    );
  }

  const trimmedDescription = description.trim();
  if (!trimmedDescription) {
    return new Err(
      new DustError(
        "invalid_request_error",
        "Agent description cannot be empty."
      )
    );
  }

  if (trimmedDescription === agent.description) {
    return new Err(
      new DustError(
        "invalid_request_error",
        `The agent is already described as "${agent.description}".`
      )
    );
  }

  return new Ok({ description: trimmedDescription });
}

export async function suggestAgentDescription(
  auth: Authenticator,
  { agentId, description, analysis }: SuggestAgentDescriptionArgs
): Promise<Result<AgentSuggestionResource, MCPError>> {
  const agent = await getAgentConfiguration(auth, {
    agentId,
    variant: "light",
  });
  if (!agent || !agent.canRead) {
    return new Err(new MCPError("Agent not found."));
  }

  const validation = await validateAgentDescriptionChange(agent, {
    description,
  });
  if (validation.isErr()) {
    return new Err(new MCPError(validation.error.message));
  }

  const conflicting = await AgentSuggestionResource.listByAgentConfigurationId(
    auth,
    agent.sId,
    { states: ["pending"], kind: "description" }
  );
  await AgentSuggestionResource.bulkUpdateState(auth, conflicting, "outdated");

  const suggestion = await AgentSuggestionResource.createSuggestionForAgent(
    auth,
    agent,
    {
      kind: "description",
      suggestion: { description: validation.value.description },
      analysis: analysis ?? null,
      state: "pending",
      conversationId: null,
      source: "conversational",
    }
  );
  return new Ok(suggestion);
}

export async function suggestAgentDescriptionHandler(
  args: SuggestAgentDescriptionArgs,
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const result = await suggestAgentDescription(auth, args);
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
