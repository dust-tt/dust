import { DustAPI } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { getOrCreateConversation } from "@app/lib/actions/mcp_internal_actions/servers/run_agent/conversation";
import {
  makeInternalMCPServer,
  makeMCPToolExit,
} from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { DEEP_DIVE_NAME } from "@app/lib/api/assistant/global_agents/configurations/dust/consts";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import { mentionAgent } from "@app/lib/mentions";
import logger from "@app/logger/logger";
import {
  Err,
  getHeaderFromUserEmail,
  GLOBAL_AGENTS_SID,
  isGlobalAgentId,
  Ok,
} from "@app/types";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("deep_dive");

  const owner = auth.getNonNullableWorkspace();

  server.tool(
    "handoff",
    `Hand off the task to @${DEEP_DIVE_NAME} agent for comprehensive analysis across company data, databases, and web sources.`,
    {},
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: "handoff",
        agentLoopContext,
        enableAlerting: true,
      },
      async () => {
        if (!agentLoopContext?.runContext) {
          return new Err(new MCPError("No conversation context available"));
        }

        const user = auth.user();
        const prodCredentials = await prodAPICredentialsForOwner(owner);
        const api = new DustAPI(
          config.getDustAPIConfig(),
          {
            ...prodCredentials,
            extraHeaders: {
              // We use a system API key to override the user here (not groups and role) so that the
              // sub-agent can access the same spaces as the user but also as the sub-agent may rely
              // on personal actions that have to be operated in the name of the user initiating the
              // interaction.
              ...getHeaderFromUserEmail(user?.email),
            },
          },
          logger
        );

        const runContext = agentLoopContext.runContext;
        const { agentConfiguration, conversation, agentMessage } = runContext;
        const instructions = agentConfiguration.instructions;
        let query = `The user's query is being handed off to you from @${agentConfiguration.name} within the same conversation.`;

        const shouldIncludeAgentInstructions =
          agentConfiguration.instructions &&
          agentConfiguration.instructions.length > 0 &&
          !isGlobalAgentId(agentConfiguration.sId);

        if (shouldIncludeAgentInstructions) {
          query += ` The calling agent's instructions are: <caller_agent_instructions>${instructions ?? ""}</caller_agent_instructions>`;
        }

        const convRes = await getOrCreateConversation(api, runContext, {
          childAgentBlob: {
            name: DEEP_DIVE_NAME,
            description: "Deep dive agent",
          },
          childAgentId: GLOBAL_AGENTS_SID.DEEP_DIVE,
          mainAgent: agentConfiguration,
          originMessage: agentMessage,
          mainConversation: conversation,
          query,
          toolsetsToAdd: null,
          fileOrContentFragmentIds: null,
          conversationId: conversation.sId,
        });

        if (convRes.isErr()) {
          return new Err(convRes.error);
        }

        const response = makeMCPToolExit({
          message: `Handoff from ${mentionAgent(agentConfiguration)} to ${mentionAgent({ name: DEEP_DIVE_NAME, sId: GLOBAL_AGENTS_SID.DEEP_DIVE })}successfully launched.`,
          isError: false,
        });

        return new Ok(response.content);
      }
    )
  );

  return server;
}

export default createServer;
