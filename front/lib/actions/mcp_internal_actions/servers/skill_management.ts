import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { ENABLE_SKILL_TOOL_NAME } from "@app/lib/actions/constants";
import { MCPError } from "@app/lib/actions/mcp_errors";
import { SKILL_MANAGEMENT_SERVER_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { SkillResource } from "@app/lib/resources/skill/skill_resource";
import { Err, Ok } from "@app/types";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer(SKILL_MANAGEMENT_SERVER_NAME);

  server.tool(
    ENABLE_SKILL_TOOL_NAME,
    "Enable a skill for the current conversation. " +
      "The skill will be available for subsequent messages from the same agent in this conversation.",
    {
      skillName: z.string().describe("The name of the skill to enable"),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: ENABLE_SKILL_TOOL_NAME,
        agentLoopContext,
      },
      async ({ skillName }) => {
        if (!agentLoopContext?.runContext) {
          return new Err(new MCPError("No conversation context available"));
        }

        const { conversation, agentConfiguration, agentMessage } =
          agentLoopContext.runContext;

        const skill = await SkillResource.fetchActiveByName(auth, skillName);
        if (!skill) {
          return new Err(
            new MCPError(`Skill "${skillName}" not found`, {
              tracked: false,
            })
          );
        }

        const enableResult = await skill.enableForAgent(auth, {
          agentConfiguration,
          conversation,
        });

        if (enableResult.isErr()) {
          return new Err(
            new MCPError(enableResult.error.message, { tracked: false })
          );
        }

        return new Ok([
          {
            type: "text",
            text: `Skill "${skill.name}" has been enabled.`,
          },
        ]);
      }
    )
  );

  return server;
}

export default createServer;
