import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getAgentConfigurationForDetails } from "@app/lib/api/assistant/configuration/agent";
import { Ok } from "@app/types/shared/result";

export async function getAgentDetails(
  { agentId }: { agentId: string },
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  // Admins get every agent of the workspace, with the private fields redacted (`canRead` false)
  // for the ones they cannot read. Everyone else only gets the agents they can read.
  const agent = await getAgentConfigurationForDetails(auth, { agentId });

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

  const header =
    `Agent ${agent.name} [${agent.sId}]\n` +
    `- Description: ${agent.description}\n` +
    `- Scope: ${agent.scope}\n` +
    `- Model: ${agent.model.providerId}/${agent.model.modelId}\n`;

  if (!agent.canRead) {
    return new Ok([
      {
        type: "text" as const,
        text:
          header +
          "\nInstructions, skills, tools and knowledge are private: you are " +
          "not an editor of this agent, or not a member of every space it " +
          "requires. This cannot be overridden from this tool.",
      },
    ]);
  }

  const toolNames = agent.actions.map((action) => action.name).join(", ");
  const skillNames = (agent.skills ?? []).join(", ");

  return new Ok([
    {
      type: "text" as const,
      text:
        header +
        `- Skills: ${skillNames || "none"}\n` +
        `- Tools: ${toolNames || "none"}\n\n` +
        "Instructions (full system prompt):\n" +
        `${agent.instructions ?? "(no instructions)"}`,
    },
  ]);
}
