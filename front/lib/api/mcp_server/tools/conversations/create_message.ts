import { resolveAgentConfigurationIdByName } from "@app/lib/api/assistant/configuration/agent";
import { postUserMessage } from "@app/lib/api/assistant/conversation";
import config from "@app/lib/api/config";
import { registerDustMcpTool } from "@app/lib/api/mcp_server/tools/register";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
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
  registerDustMcpTool(
    server,
    "create_conversation_message",
    {
      description: `Post a user message to an existing conversation. By default triggers the "${DEFAULT_AGENT_NAME}" agent. Pass agentName: null to post without triggering any agent.`,
      inputSchema,
    },
    async (auth, { conversationId, message, agentName }) => {
      const user = auth.user();

      const conversationResource = await ConversationResource.fetchById(
        auth,
        conversationId
      );
      if (!conversationResource) {
        return mcpError("Conversation not found");
      }

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
        conversationResource,
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
        conversationResource.sId
      )}`;

      return mcpJsonResponse({
        conversationId: conversationResource.sId,
        conversationUrl,
        userMessageId: messageRes.value.userMessage.sId,
        agentMessageIds: messageRes.value.agentMessages.map(
          (agentMessage) => agentMessage.sId
        ),
      });
    }
  );
}
