import { ConversationPublicType, DustAPI } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  getDustAPI,
  postConversation,
  postMessage,
  streamAgentAnswer,
} from "./api.js";
import {
  DustConfig,
  logError,
  logFatalError,
  logJson,
  logToFile,
} from "./config.js";

async function askAgent(
  dustAPI: DustAPI,
  dustConfig: DustConfig,
  conversationId: string | undefined,
  message: string
) {
  let userMessageId: string;
  let conversation: ConversationPublicType;

  try {
    if (!conversationId) {
      // Create new conversation with initial message
      await logToFile(`Creating new conversation with message: ${message}`);
      const conversationResult = await postConversation({
        dustAPI: dustAPI,
        messageData: {
          input: message,
          mentions: [{ configurationId: dustConfig.agentId }],
        },
      });

      if (!conversationResult.isOk()) {
        const error = `Failed to create conversation: ${conversationResult.error.message}`;
        await logError(error);
        throw new Error(error);
      }

      conversation = conversationResult.value;
      userMessageId = conversation.content[0][0].sId;
      await logJson("Created conversation", {
        conversationId: conversation.sId,
        userMessageId,
        content: conversation.content,
      });
    } else {
      // Post to existing conversation
      await logJson("Posting to existing conversation", {
        conversationId,
        message,
      });
      const messageResult = await postMessage({
        dustAPI: dustAPI,
        conversationId,
        messageData: {
          input: message,
          mentions: [{ configurationId: dustConfig.agentId }],
        },
      });

      if (!messageResult.isOk()) {
        const error = `Failed to post message: ${messageResult.error.message}`;
        await logError(error);
        throw new Error(error);
      }

      // Get the conversation to stream the agent's answer
      const conversationResult = await dustAPI.getConversation({
        conversationId,
      });

      if (!conversationResult.isOk()) {
        const error = `Failed to get conversation: ${conversationResult.error.message}`;
        await logError(error);
        throw new Error(error);
      }

      conversation = conversationResult.value;
      userMessageId = messageResult.value.message.sId;
      await logJson("Posted message", {
        conversationId,
        userMessageId,
        messageContent: messageResult.value.message,
        conversation: conversation.content,
      });
    }

    // Get agent's response
    await logJson("Getting agent response for", {
      userMessageId,
      conversationId: conversation.sId,
    });
    const agentResult = await streamAgentAnswer({
      dustAPI: dustAPI,
      conversation,
      userMessageId,
    });

    if (!agentResult.isOk()) {
      const error = `Failed to get agent's answer: ${agentResult.error.message}`;
      await logError(error);
      throw new Error(error);
    }

    await logToFile(
      `Successfully received agent response for conversation ${conversation.sId}`
    );

    await logJson("Agent response", {
      conversationId: conversation.sId,
      message: agentResult.value,
    });

    return {
      conversationId: conversation.sId,
      message: agentResult.value,
    };
  } catch (error) {
    await logFatalError(error);
    throw error;
  }
}

export async function startServer() {
  // Initialize the Dust API
  const { dustAPI, dustConfig } = await getDustAPI();

  // Initialize the MCP server
  const server = new McpServer({
    name: "dust-mcp-server",
    version: "1.0.0",
  });

  // Register the ask-agent tool
  server.tool(
    "ask-agent",
    "Ask a question to a Dust agent",
    {
      conversationId: z
        .string()
        .optional()
        .describe(
          "Existing conversation ID - must be provided to continue a conversation"
        ),
      message: z.string().describe("Message to send to the agent"),
    },
    async ({ conversationId, message }) => {
      const result = await askAgent(
        dustAPI,
        dustConfig,
        conversationId,
        message
      );
      return {
        content: [
          {
            type: "text",
            text: result.message.content || "No response from agent",
          },
        ],
        conversationId: result.conversationId,
      };
    }
  );

  // Set up and start the server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Dust MCP Server running on stdio");
}
