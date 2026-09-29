import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { AgentResource } from "@app/lib/resources/agent_resource";
import { Ok } from "@app/types/shared/result";

export async function getAgentDetails(
  { agentId }: { agentId: string },
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const agent = await AgentResource.fetchById(auth, agentId);

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
    `- Model: ${agent.modelConfiguration.providerId}/${agent.modelConfiguration.modelId}\n`;

  if (!agent.isFull()) {
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

  const [actions, skills] = await Promise.all([
    agent.listActions(auth),
    agent.listSkills(auth),
  ]);
  const toolNames = actions.map((action) => action.name).join(", ");
  const skillNames = skills.map((skill) => skill.name).join(", ");

  return new Ok([
    {
      type: "text" as const,
      text:
        header +
        `- Skills: ${skillNames || "none"}\n` +
        `- Tools: ${toolNames || "none"}\n\n` +
        "Instructions (full system prompt):\n" +
        `${agent.content.instructions ?? "(no instructions)"}`,
    },
  ]);
}
