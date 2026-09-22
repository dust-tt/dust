import { MCPError } from "@app/lib/actions/mcp_errors";
import type {
  ToolHandlerExtra,
  ToolHandlerResult,
} from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { getAgentConfigurationForDetails } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

export type DescribeAgentArgs = { agentId: string };

export async function describeAgent(
  auth: Authenticator,
  { agentId }: DescribeAgentArgs
): Promise<Result<AgentConfigurationType, MCPError>> {
  const agent = await getAgentConfigurationForDetails(auth, { agentId });
  if (!agent) {
    return new Err(new MCPError("Agent not found."));
  }

  return new Ok(agent);
}

/**
 * @cc [owner:avervaet,label:mcp;security] private-agent-instructions-not-exposed
 * MUST NOT expose an agent's instructions, tools or skills to a caller without `read` on that
 * agent, whatever their role. Redaction comes exclusively from `getAgentConfigurationForDetails`;
 * this handler MUST check the returned `canRead` before reading `instructions`,
 * `instructionsHtml` or `actions`.
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
          "\nInstructions, skills and tools are private: you are not an editor of this agent, " +
          "or not a member of every space it requires. This cannot be overridden from this tool.",
      },
    ]);
  }

  const toolNames = agent.actions.map((action) => action.name).join(", ");
  // Only reached for an agent the caller can read, so its skills are not private.
  const skills = await SkillResource.listByAgentConfiguration(auth, agent);
  const skillNames = skills.map((skill) => skill.name).join(", ");

  const instructionsBlock = agent.instructionsHtml
    ? "Instructions (full system prompt), as HTML whose blocks carry a data-block-id — " +
      "required to target block-level instruction edits:\n" +
      agent.instructionsHtml
    : `Instructions (full system prompt):\n${agent.instructions ?? "(no instructions)"}`;

  return new Ok([
    {
      type: "text" as const,
      text:
        header +
        `- Skills: ${skillNames || "none"}\n` +
        `- Tools: ${toolNames || "none"}\n\n` +
        instructionsBlock,
    },
  ]);
}
