import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import { Ok } from "@app/types/shared/result";

export async function getAgentDetails(
  { agentId }: { agentId: string },
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const agents = await getAgentConfigurations(auth, {
    agentIds: [agentId],
    variant: "full",
  });
  const agent = agents[0];

  if (!agent) {
    return new Ok([
      {
        type: "text" as const,
        text:
          `No agent found with id ${agentId} (it may be archived or not ` +
          "accessible).",
      },
    ]);
  }

  if (!agent.canRead) {
    return new Ok([
      {
        type: "text" as const,
        text:
          `Agent ${agent.name} [${agent.sId}]\n` +
          `- Description: (private agent - not available)\n` +
          `- Scope: ${agent.scope}\n` +
          `- Model: ${agent.model.providerId}/${agent.model.modelId}\n\n` +
          "Instructions, skills, and tools are not available for private " +
          "agents you do not have access to.",
      },
    ]);
  }

  const toolNames = agent.actions.map((action) => action.name).join(", ");
  const skillNames = (agent.skills ?? []).join(", ");

  return new Ok([
    {
      type: "text" as const,
      text:
        `Agent ${agent.name} [${agent.sId}]\n` +
        `- Description: ${agent.description}\n` +
        `- Scope: ${agent.scope}\n` +
        `- Model: ${agent.model.providerId}/${agent.model.modelId}\n` +
        `- Skills: ${skillNames || "none"}\n` +
        `- Tools: ${toolNames || "none"}\n\n` +
        "Instructions (full system prompt):\n" +
        `${agent.instructions ?? "(no instructions)"}`,
    },
  ]);
}
