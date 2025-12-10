import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { DEFAULT_ENABLE_SKILL_TOOL_NAME } from "@app/lib/actions/constants";
import { MCPError } from "@app/lib/actions/mcp_errors";
import { SKILL_MANAGEMENT_SERVER_NAME } from "@app/lib/actions/mcp_internal_actions/constants";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { AgentMessageSkillModel } from "@app/lib/models/skill/agent_message_skill";
import { SkillConfigurationResource } from "@app/lib/resources/skill_configuration_resource";
import { Err, Ok } from "@app/types";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer(SKILL_MANAGEMENT_SERVER_NAME);

  server.tool(
    DEFAULT_ENABLE_SKILL_TOOL_NAME,
    "Enable a skill for the current conversation. The skill will be available for subsequent messages in this conversation.",
    {
      skillId: z
        .string()
        .describe("The id of the skill to enable for the conversation"),
    },
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: DEFAULT_ENABLE_SKILL_TOOL_NAME,
        agentLoopContext,
      },
      async ({ skillId }) => {
        if (!agentLoopContext?.runContext) {
          return new Err(new MCPError("No conversation context available"));
        }

        const workspace = auth.getNonNullableWorkspace();

        const { conversation, agentConfiguration, agentMessage } =
          agentLoopContext.runContext;

        const skill = await SkillConfigurationResource.fetchById(auth, skillId);
        if (!skill) {
          return new Err(
            new MCPError(`Skill "${skillId}" not found`, {
              tracked: false,
            })
          );
        }

        // TODO(skill): Create a AgentMessageSkillResource to encapsulate this logic
        await AgentMessageSkillModel.create({
          workspaceId: workspace.id,
          agentConfigurationId: agentConfiguration.id,
          isActive: true,
          customSkillId: skill.id,
          globalSkillId: null,
          agentMessageId: agentMessage.id,
          conversationId: conversation.id,
          source: "agent_enabled",
          addedByUserId: null,
        });

        return new Ok([
          {
            type: "text",
            text: `Skill "${skill.name}" has been enabled for this conversation.`,
          },
        ]);
      }
    )
  );

  return server;
}

export default createServer;
