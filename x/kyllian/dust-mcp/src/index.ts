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

const { dustAPI, dustConfig } = await getDustAPI();

const server = new McpServer({
  name: "dust-mcp-server",
  version: "1.0.0",
});

async function askAgent(
  dustAPI: DustAPI,
  conversationId: string | undefined,
  message: string
) {
  let userMessageId: string;
  let conversation: ConversationPublicType;

  if (!conversationId) {
    // Create new conversation with initial message
    console.log("Creating new conversation with message:", message);
    const conversationResult = await postConversation({
      dustAPI: dustAPI,
      messageData: {
        input: message,
        mentions: [{ configurationId: dustConfig.agentId }],
      },
    });

    if (!conversationResult.isOk()) {
      throw new Error(
        `Failed to create conversation: ${conversationResult.error.message}`
      );
    }

    conversation = conversationResult.value;
    userMessageId = conversation.content[0][0].sId;
    console.log("Created conversation:", {
      conversationId: conversation.sId,
      userMessageId,
      content: conversation.content,
    });
  } else {
    // Post to existing conversation
    console.log("Posting to existing conversation:", {
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
      throw new Error(`Failed to post message: ${messageResult.error.message}`);
    }

    // Get the conversation to stream the agent's answer
    const conversationResult = await dustAPI.getConversation({
      conversationId,
    });

    if (!conversationResult.isOk()) {
      throw new Error(
        `Failed to get conversation: ${conversationResult.error.message}`
      );
    }

    conversation = conversationResult.value;
    userMessageId = messageResult.value.message.sId;
    console.log("Posted message:", {
      conversationId,
      userMessageId,
      messageContent: messageResult.value.message,
      conversation: conversation.content,
    });
  }

  // Get agent's response
  console.log("Getting agent response for:", {
    userMessageId,
    conversationId: conversation.sId,
  });
  const agentResult = await streamAgentAnswer({
    dustAPI: dustAPI,
    conversation,
    userMessageId,
  });

  if (!agentResult.isOk()) {
    throw new Error(
      `Failed to get agent's answer: ${agentResult.error.message}`
    );
  }

  return {
    conversationId: conversation.sId,
    message: agentResult.value,
  };
}

server.tool(
  "ask-agent",
  "Ask a question to a Dust agent", // TODO(kyllian): Get and use real description of the agent
  {
    conversationId: z
      .string()
      .optional()
      .describe("Optional existing conversation ID"),
    message: z.string().describe("Message to send to the agent"),
  },
  async ({ conversationId, message }) => {
    const result = await askAgent(dustAPI, conversationId, message);
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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.log("Dust MCP Server running on stdio");
}

main().catch((error) => {
  console.error("Fatal error in main():", error);
  process.exit(1);
});
