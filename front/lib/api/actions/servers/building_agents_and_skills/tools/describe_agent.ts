import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { isServerSideMCPServerConfiguration } from "@app/lib/actions/types/guards";
import type { Authenticator } from "@app/lib/auth";
import { AgentResource } from "@app/lib/resources/agent_resource";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type DescribeAgentArgs = { agentId: string };

export async function describeAgent(
  auth: Authenticator,
  { agentId }: DescribeAgentArgs
): Promise<Result<AgentResource, MCPError>> {
  const agent = await AgentResource.fetchById(auth, agentId);
  if (!agent) {
    return new Err(new MCPError("Agent not found."));
  }

  return new Ok(agent);
}

/**
 * @cc [owner:avervaet,label:mcp;security] private-agent-instructions-not-exposed
 * MUST NOT expose an agent's instructions, tools, skills or structured output to a caller who cannot
 * view its content, whatever their role. Visibility comes exclusively from the resource
 * (`agent-content-visibility`): this handler MUST check `isFull()` before reading the instructions,
 * tools, skills or structured output.
 */
export async function describeAgentHandler(
  args: DescribeAgentArgs,
  { auth }: ToolHandlerExtra
): Promise<ToolHandlerResult> {
  const result = await describeAgent(auth, args);
  if (result.isErr()) {
    return result;
  }

  const agent = result.value;
  // Tags are public (`list_agents` shows them too), so they are not withheld from non-readers.
  const tagNames = (await agent.listTags(auth))
    .map((tag) => tag.name)
    .sort((a, b) => a.localeCompare(b))
    .join(", ");
  const header =
    `Agent ${agent.name} [${agent.sId}]\n` +
    `- Description: ${agent.description}\n` +
    `- Scope: ${agent.scope}\n` +
    `- Model: ${agent.modelConfiguration.providerId}/${agent.modelConfiguration.modelId}\n` +
    `- Tags: ${tagNames || "none"}\n`;

  if (!agent.isFull()) {
    return new Ok([
      {
        type: "text" as const,
        text:
          header +
          "\nInstructions, skills and tools are private: you are not an editor of this agent, " +
          "or not a member of every space it requires. This cannot be overridden from this tool.",
      },
    ]);
  }

  const [actions, skills] = await Promise.all([
    agent.listActions(auth),
    agent.listSkills(auth),
  ]);
  // Tools carry their id, as `list_tools` prints them, so that they can be removed by id. Sub-agent
  // actions carry the id of the agent they run instead, which is how sub-agents are removed.
  const toolNames = actions
    .map((action) =>
      !isServerSideMCPServerConfiguration(action)
        ? action.name
        : action.childAgentId
          ? `${action.name} [sub-agent ${action.childAgentId}]`
          : `${action.name} [${action.mcpServerViewId}]`
    )
    .join(", ");
  // Skills carry their id, as `list_skills` prints them, so that they can be removed.
  const skillNames = skills
    .map((skill) => `${skill.name} [${skill.sId}]`)
    .join(", ");

  const { instructions, instructionsHtml } = agent.content;
  const instructionsBlock = instructionsHtml
    ? "Instructions (full system prompt), as HTML whose blocks carry a data-block-id — " +
      "required to target block-level instruction edits:\n" +
      instructionsHtml
    : `Instructions (full system prompt):\n${instructions ?? "(no instructions)"}`;

  const { responseFormat } = agent.modelConfiguration;
  const structuredOutputLine = responseFormat
    ? `- Structured output (JSON response format): ${responseFormat}\n`
    : "";

  return new Ok([
    {
      type: "text" as const,
      text:
        header +
        `- Skills: ${skillNames || "none"}\n` +
        `- Tools: ${toolNames || "none"}\n` +
        structuredOutputLine +
        "\n" +
        instructionsBlock,
    },
  ]);
}
