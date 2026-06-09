import { resolveAgentConfigurationIdByName } from "@app/lib/api/assistant/configuration/agent";
import { postUserMessage } from "@app/lib/api/assistant/conversation";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import { getConversationApiError } from "@app/lib/api/assistant/conversation/helper";
import config from "@app/lib/api/config";
import { getAuthenticatorFromMcpContext } from "@app/lib/api/mcp_server/context";
import { getConversationRoute } from "@app/lib/utils/router";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mcpError, mcpJsonResponse } from "../response";

const DEFAULT_AGENT_NAME = "Dust";

const inputSchema = {
  conversationId: z
    .string()
    .describe("ID of the conversation to post a message to."),
  message: z.string().describe("Message content to post."),
  agentName: z
    .string()
    .nullable()
    .default(DEFAULT_AGENT_NAME)
    .describe(
      `Agent name to mention and trigger. Defaults to "${DEFAULT_AGENT_NAME}". Pass null explicitly to post a message without triggering any agent.`
    ),
};

export function registerConversationsCreateMessageTool(server: McpServer) {
  server.registerTool(
    "create_conversation_message",
    {
      description: `Post a user message to an existing conversation. By default triggers the "${DEFAULT_AGENT_NAME}" agent. Pass agentName: null to post without triggering any agent.`,
      inputSchema,
    },
    async ({ conversationId, message, agentName }) => {
      const auth = getAuthenticatorFromMcpContext();
      const user = auth.user();

      const conversationRes = await getConversation(auth, conversationId);
      if (conversationRes.isErr()) {
        const apiError = getConversationApiError(conversationRes.error);
        return mcpError(apiError.api_error.message);
      }

      const conversation = conversationRes.value;

      let mentions: { configurationId: string }[] = [];
      if (agentName !== null) {
        const matchedAgentId = await resolveAgentConfigurationIdByName(
          auth,
          agentName
        );
        if (!matchedAgentId) {
          return mcpError(`No agent found matching name: "${agentName}"`);
        }
        mentions = [{ configurationId: matchedAgentId }];
      }

      const messageRes = await postUserMessage(auth, {
        conversation,
        content: message,
        mentions,
        context: {
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          username: user.username,
          fullName: user.fullName(),
          email: user.email,
          profilePictureUrl: user.imageUrl,
          origin: "api",
          clientSideMCPServerIds: [],
          selectedMCPServerViewIds: [],
          lastTriggerRunAt: null,
        },
        skipToolsValidation: false,
      });

      if (messageRes.isErr()) {
        return mcpError(messageRes.error.api_error.message);
      }

      const owner = auth.workspace();
      const conversationUrl = `${config.getAppUrl()}${getConversationRoute(
        owner.sId,
        conversation.sId
      )}`;

      return mcpJsonResponse({
        conversationId: conversation.sId,
        conversationUrl,
        userMessageId: messageRes.value.userMessage.sId,
        agentMessageIds: messageRes.value.agentMessages.map(
          (agentMessage) => agentMessage.sId
        ),
      });
    }
  );
}
