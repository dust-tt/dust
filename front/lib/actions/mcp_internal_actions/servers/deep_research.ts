import type { MCPProgressNotificationType } from "@dust-tt/client";
import { DustAPI, INTERNAL_MIME_TYPES } from "@dust-tt/client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { getOrCreateConversation } from "@app/lib/actions/mcp_internal_actions/servers/run_agent/conversation";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { prodAPICredentialsForOwner } from "@app/lib/auth";
import logger from "@app/logger/logger";
import { Err, getHeaderFromUserEmail, GLOBAL_AGENTS_SID, Ok } from "@app/types";

const createServer = (
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer => {
  const server = makeInternalMCPServer("deep_research");

  const owner = auth.getNonNullableWorkspace();

  server.tool(
    "run_dust_deep",
    "Handoff the query to the generic deep research agent",
    {
      query: z
        .string()
        .describe(
          "The research query or question to be investigated that includes any company or user specific context relevant to the query. This should be a clear, specific request that will be processed by the deep research agent."
        ),
    },
    withToolLogging(
      auth,
      { toolName: "run_dust_deep", agentLoopContext },
      async ({ query }, { sendNotification, _meta }) => {
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

        if (_meta?.progressToken && sendNotification) {
          // Store the query resource immediately so it's available in the UI while the action is running.
          const storeResourceNotification: MCPProgressNotificationType = {
            method: "notifications/progress",
            params: {
              progress: 0,
              total: 1,
              progressToken: _meta.progressToken,
              data: {
                label: `Storing query resource`,
                output: {
                  type: "store_resource",
                  contents: [
                    {
                      type: "resource",
                      resource: {
                        mimeType:
                          INTERNAL_MIME_TYPES.TOOL_OUTPUT.RUN_AGENT_QUERY,
                        text: query,
                        childAgentId: GLOBAL_AGENTS_SID.DUST_DEEP,
                        uri: "",
                      },
                    },
                    {
                      type: "resource",
                      resource: {
                        mimeType:
                          INTERNAL_MIME_TYPES.TOOL_OUTPUT.RUN_AGENT_HANDOVER,
                        text: instructions ?? "",
                        uri: "",
                      },
                    },
                  ],
                },
              },
            },
          };
          await sendNotification(storeResourceNotification);
        }

        const convRes = await getOrCreateConversation(api, runContext, {
          childAgentBlob: {
            name: "dust-deep",
            description: "Deep research agent",
          },
          childAgentId: GLOBAL_AGENTS_SID.DUST_DEEP,
          mainAgent: agentConfiguration,
          mainConversation: conversation,
          query,
          toolsetsToAdd: null,
          fileOrContentFragmentIds: null,
          conversationId: conversation.sId,
        });

        if (convRes.isErr()) {
          return new Err(new MCPError(convRes.error.message));
        }

        return new Ok([
          {
            type: "resource" as const,
            resource: {
              mimeType: INTERNAL_MIME_TYPES.TOOL_OUTPUT.RUN_AGENT_RESULT,
              conversationId: convRes.value.conversation.sId,
              text: `Query fully handed off from agent ${agentConfiguration.name} to agent dust-deep. ${agentConfiguration.name} cannot interact with or modify the research after this handoff. dust-deep has complete control and will provide the final results directly to the user. Original agent instructions: ${instructions}`,
              uri: "",
            },
          },
        ]);
      }
    )
  );

  return server;
};

export default createServer;
