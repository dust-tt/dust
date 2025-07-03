import type {
  CreateConversationResponseType,
  GetAgentConfigurationsResponseType,
  MeResponseType,
} from "@dust-tt/client";

import { getDustClient } from "../../../utils/dustClient.js";
import { normalizeError } from "../../../utils/errors.js";

type AgentConfiguration =
  GetAgentConfigurationsResponseType["agentConfigurations"][number];

export async function sendNonInteractiveMessage(
  message: string,
  selectedAgent: AgentConfiguration,
  me: MeResponseType["user"],
  existingConversationId?: string
): Promise<void> {
  const dustClient = await getDustClient();
  if (!dustClient) {
    console.error(JSON.stringify({ 
      error: "Authentication required",
      details: "Run `dust login` first"
    }));
    process.exit(1);
  }

  try {
    let conversation: CreateConversationResponseType["conversation"];
    let userMessageId: string;
    
    if (existingConversationId) {
      // Add message to existing conversation
      const messageRes = await dustClient.postUserMessage({
        conversationId: existingConversationId,
        message: {
          content: message,
          mentions: [{ configurationId: selectedAgent.sId }],
          context: {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            username: me.username,
            fullName: me.fullName,
            email: me.email,
            origin: "api",
          },
        },
      });

      if (messageRes.isErr()) {
        console.error(JSON.stringify({ 
          error: "Error adding message to conversation",
          details: messageRes.error.message
        }));
        process.exit(1);
      }

      userMessageId = messageRes.value.sId;

      // Get the conversation for streaming
      const convRes = await dustClient.getConversation({ 
        conversationId: existingConversationId 
      });
      if (convRes.isErr()) {
        console.error(JSON.stringify({ 
          error: "Error retrieving conversation",
          details: convRes.error.message
        }));
        process.exit(1);
      }
      conversation = convRes.value;
    } else {
      // Create a new conversation with the agent
      const convRes = await dustClient.createConversation({
        title: message.substring(0, 50) + (message.length > 50 ? "..." : ""),
        visibility: "unlisted",
        message: {
          content: message,
          mentions: [{ configurationId: selectedAgent.sId }],
          context: {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            username: me.username,
            fullName: me.fullName,
            email: me.email,
            origin: "api",
          },
        },
        contentFragment: undefined,
      });

      if (convRes.isErr()) {
        console.error(JSON.stringify({ 
          error: "Failed to create conversation",
          details: convRes.error.message
        }));
        process.exit(1);
      }

      conversation = convRes.value.conversation;
      const messageId = convRes.value.message?.sId;
      
      if (!messageId) {
        console.error(JSON.stringify({ 
          error: "No message created"
        }));
        process.exit(1);
      }
      
      userMessageId = messageId;
    }

    // Stream the agent's response
    const streamRes = await dustClient.streamAgentAnswerEvents({
      conversation: conversation,
      userMessageId: userMessageId,
    });

    if (streamRes.isErr()) {
      console.error(JSON.stringify({ 
        error: "Failed to stream agent answer",
        details: streamRes.error.message
      }));
      process.exit(1);
    }

    let fullResponse = "";
    
    for await (const event of streamRes.value.eventStream) {
      if (event.type === "generation_tokens") {
        if (event.classification === "tokens") {
          fullResponse += event.text;
        }
      } else if (event.type === "agent_error") {
        console.error(JSON.stringify({ 
          error: "Agent error",
          details: event.error.message
        }));
        process.exit(1);
      } else if (event.type === "user_message_error") {
        console.error(JSON.stringify({ 
          error: "User message error",
          details: event.error.message
        }));
        process.exit(1);
      } else if (event.type === "agent_message_success") {
        // Success - output the result
        console.log(JSON.stringify({
          agentId: selectedAgent.sId,
          agentAnswer: fullResponse.trim(),
          conversationId: conversation.sId
        }));
        process.exit(0);
      }
    }
  } catch (error) {
    console.error(JSON.stringify({ 
      error: "Unexpected error",
      details: normalizeError(error).message
    }));
    process.exit(1);
  }
}

export function validateNonInteractiveFlags(
  message?: string,
  agentSearch?: string,
  conversationId?: string
): void {
  if (message && !agentSearch) {
    console.error(JSON.stringify({ 
      error: "Invalid usage",
      details: "--message requires --agent to be specified"
    }));
    process.exit(1);
  }
  if (conversationId && (!agentSearch || !message)) {
    console.error(JSON.stringify({ 
      error: "Invalid usage",
      details: "--conversationId requires both --agent and --message to be specified"
    }));
    process.exit(1);
  }
}