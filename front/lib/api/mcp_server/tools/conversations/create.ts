import { resolveAgentConfigurationIdByName } from "@app/lib/api/assistant/configuration/agent";
import {
  createConversation,
  postUserMessage,
} from "@app/lib/api/assistant/conversation";
import config from "@app/lib/api/config";
import { getAuthenticatorFromMcpContext } from "@app/lib/api/mcp_server/context";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { getConversationRoute } from "@app/lib/utils/router";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { mcpError, mcpJsonResponse } from "../response";

const DEFAULT_AGENT_NAME = "Dust";

const inputSchema = {
  title: z.string().describe("Title for the new conversation."),
  podId: z
    .string()
    .optional()
    .describe(
      "Optional Pod id. When provided, the conversation is created in that Pod."
    ),
  message: z
    .string()
    .optional()
    .describe(
      "Optional first user message to post after creating the conversation."
    ),
  agentName: z
    .string()
    .nullable()
    .default(DEFAULT_AGENT_NAME)
    .describe(
      `Agent name to mention and trigger when posting the first message. Defaults to "${DEFAULT_AGENT_NAME}". Pass null explicitly to post without triggering any agent. Only used when message is provided.`
    ),
};

export function registerConversationsCreateTool(server: McpServer) {
  server.registerTool(
    "create_conversation",
    {
      description: `Create a new conversation in the current workspace. Optionally pass podId to create it in a Pod, and message to post the first user message in the same call (triggers the "${DEFAULT_AGENT_NAME}" agent by default; pass agentName: null to post without triggering any agent).`,
      inputSchema,
    },
    async ({ title, podId, message, agentName }) => {
      const auth = getAuthenticatorFromMcpContext();

      let resolvedSpaceModelId: number | null = null;
      let podName: string | null = null;

      if (podId) {
        const pod = await SpaceResource.fetchById(auth, podId);
        if (!pod || !pod.isProject() || !pod.isMember(auth)) {
          return mcpError("Pod not found or you do not have access.");
        }
        resolvedSpaceModelId = pod.id;
        podName = pod.name;
      }

      let conversation;
      try {
        conversation = await createConversation(auth, {
          title,
          visibility: "unlisted",
          spaceId: resolvedSpaceModelId,
        });
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to create conversation.";
        return mcpError(message);
      }

      if (conversation.depth === 0) {
        await ConversationResource.upsertParticipation(auth, {
          conversation,
          action: "subscribed",
          user: auth.user().toJSON(),
        });
      }

      const owner = auth.workspace();
      const conversationUrl = `${config.getAppUrl()}${getConversationRoute(
        owner.sId,
        conversation.sId
      )}`;

      let userMessageId: string | null = null;
      let agentMessageIds: string[] = [];

      if (message) {
        const user = auth.user();

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

        userMessageId = messageRes.value.userMessage.sId;
        agentMessageIds = messageRes.value.agentMessages.map(
          (agentMessage) => agentMessage.sId
        );
      }

      return mcpJsonResponse({
        conversationId: conversation.sId,
        title: conversation.title,
        podId: conversation.spaceId,
        podName,
        conversationUrl,
        userMessageId,
        agentMessageIds,
      });
    }
  );
}
