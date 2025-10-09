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
import { DUST_DEEP_NAME } from "@app/lib/api/assistant/global_agents/configurations/dust/consts";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { Err, getHeaderFromUserEmail, GLOBAL_AGENTS_SID, Ok } from "@app/types";

const createServer = (
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer => {
  const server = makeInternalMCPServer("deep_dive");

  const owner = auth.getNonNullableWorkspace();

  server.tool(
    "dive",
    `Handoff the query to the ${DUST_DEEP_NAME} agent`,
    {},
    withToolLogging(
      auth,
      { toolName: "run_dust_deep", agentLoopContext },
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
        const { agentConfiguration, conversation } = runContext;
        const instructions = agentConfiguration.instructions;
        const query = `You have been summoned by @${agentConfiguration.name}. Its instructions are: <main_agent_instructions>${instructions ?? ""}</main_agent_instructions>`;

        const convRes = await getOrCreateConversation(api, runContext, {
          childAgentBlob: {
            name: DUST_DEEP_NAME,
            description: "Deep research agent",
          },
          childAgentId: GLOBAL_AGENTS_SID.DUST_DEEP,
          mainAgent: agentConfiguration,
          originMessage: agentLoopContext.runContext.agentMessage,
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
          message: `Deep diving by forwarding this request to @${DUST_DEEP_NAME}.`,
          isError: false,
        });

        return new Ok(response.content);
      }
    )
  );

  return server;
};

export default createServer;
