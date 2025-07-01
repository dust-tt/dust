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
  existingConversationId?: string,
  showDetails?: boolean
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
    const eventDetails: any[] = [];
    
    for await (const event of streamRes.value.eventStream) {
      // If details flag is set, collect all events
      if (showDetails) {
        eventDetails.push({
          ...event,
          timestamp: Date.now()
        });
      }
      
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
        const output: any = {
          agentId: selectedAgent.sId,
          agentAnswer: fullResponse.trim(),
          conversationId: conversation.sId,
          messageId: event.message.sId
        };
        
        // Add detailed event history if requested
        if (showDetails) {
          output.events = eventDetails;
          output.agentMessage = event.message;
        }
        
        console.log(JSON.stringify(output));
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
  conversationId?: string,
  messageId?: string,
  details?: boolean
): void {
  // Check --messageId exclusivity
  if (messageId && (agentSearch || message || conversationId)) {
    console.error(JSON.stringify({ 
      error: "Invalid usage",
      details: "--messageId is exclusive and cannot be used with --agent, --message, or --conversationId"
    }));
    process.exit(1);
  }
  
  // Check --details requirements
  if (details && (!agentSearch || !message)) {
    console.error(JSON.stringify({ 
      error: "Invalid usage",
      details: "--details requires both --agent and --message to be specified"
    }));
    process.exit(1);
  }
  
  // Existing validations
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

export async function fetchMessageDetails(messageId: string): Promise<void> {
  // For now, we'll output an error since there's no direct API to get message details
  // This functionality would require knowing the conversation ID as well
  console.error(JSON.stringify({ 
    error: "Not implemented",
    details: "Message retrieval by ID requires conversation ID. Please use the message details provided when sending messages with --details flag."
  }));
  process.exit(1);
}