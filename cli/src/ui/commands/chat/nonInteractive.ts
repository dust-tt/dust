import type {
  CreateConversationResponseType,
  DustAPI,
  GetAgentConfigurationsResponseType,
  MeResponseType,
} from "@dust-tt/client";

import { getDustClient } from "../../../utils/dustClient.js";
import { normalizeError } from "../../../utils/errors.js";

type AgentConfiguration =
  GetAgentConfigurationsResponseType["agentConfigurations"][number];

/**
 * Resolves a projectName or projectId to a spaceId.
 * - If projectId is provided, validates it exists.
 * - If projectName is provided, finds a matching space by name (case-insensitive).
 * - Returns undefined if neither is provided.
 * - Throws an error if the space is not found or multiple matches exist.
 */
export async function resolveSpaceId(
  dustClient: DustAPI,
  projectName?: string,
  projectId?: string
): Promise<string | undefined> {
  if (!projectName && !projectId) {
    return undefined;
  }

  const spacesRes = await dustClient.getSpaces();
  if (spacesRes.isErr()) {
    throw new Error(`Failed to fetch spaces: ${spacesRes.error.message}`);
  }

  const spaces = spacesRes.value;

  if (projectId) {
    const space = spaces.find((s) => s.sId === projectId);
    if (!space) {
      throw new Error(`Project with ID "${projectId}" not found`);
    }
    return space.sId;
  }

  if (projectName) {
    const searchLower = projectName.toLowerCase();
    const matchingSpaces = spaces.filter(
      (s) => s.name.toLowerCase() === searchLower
    );

    if (matchingSpaces.length === 0) {
      throw new Error(`Project with name "${projectName}" not found`);
    }

    if (matchingSpaces.length > 1) {
      throw new Error(
        `Multiple projects match name "${projectName}": ${matchingSpaces.map((s) => s.name).join(", ")}`
      );
    }

    return matchingSpaces[0].sId;
  }

  return undefined;
}

// Event types we handle in the code
interface BaseEvent {
  type: string;
  created?: number;
  [key: string]: unknown;
}

interface EventDetail extends BaseEvent {
  timestamp: number;
}

interface NonInteractiveOutput {
  agentId: string;
  agentAnswer: string;
  conversationId: string;
  messageId: string;
  events?: EventDetail[];
  agentMessage?: unknown;
  cancelled?: boolean;
}

export async function sendNonInteractiveMessage(
  message: string,
  selectedAgent: AgentConfiguration,
  me: MeResponseType["user"],
  existingConversationId?: string,
  showDetails?: boolean,
  projectName?: string,
  projectId?: string,
  setError?: (error: string) => void
): Promise<void> {
  const dustClientRes = await getDustClient();
  if (dustClientRes.isErr()) {
    const errorMsg = `Failed to get client: ${dustClientRes.error.message}`;
    if (setError) {
      setError(errorMsg);
      return;
    }
    process.exit(1);
  }

  const dustClient = dustClientRes.value;
  if (!dustClient) {
    const errorMsg = "Authentication required: Run `dust login` first";
    if (setError) {
      setError(errorMsg);
      return;
    }
    process.exit(1);
  }

  try {
    // Resolve spaceId if projectName or projectId is provided
    let spaceId: string | undefined;
    try {
      spaceId = await resolveSpaceId(dustClient, projectName, projectId);
    } catch (error) {
      const errorMsg = normalizeError(error).message;
      if (setError) {
        setError(errorMsg);
        return;
      }
      process.exit(1);
    }

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
            origin: "cli_programmatic",
          },
        },
      });

      if (messageRes.isErr()) {
        const errorMsg = `Error adding message to conversation: ${messageRes.error.message}`;
        if (setError) {
          setError(errorMsg);
          return;
        }
        process.exit(1);
      }

      userMessageId = messageRes.value.sId;

      // Get the conversation for streaming
      const convRes = await dustClient.getConversation({
        conversationId: existingConversationId,
      });
      if (convRes.isErr()) {
        const errorMsg = `Error retrieving conversation: ${convRes.error.message}`;
        if (setError) {
          setError(errorMsg);
          return;
        }
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
            origin: "cli_programmatic",
          },
        },
        contentFragment: undefined,
        spaceId,
      });

      if (convRes.isErr()) {
        const errorMsg = `Failed to create conversation: ${convRes.error.message}`;
        if (setError) {
          setError(errorMsg);
          return;
        }
        process.exit(1);
      }

      conversation = convRes.value.conversation;
      const messageId = convRes.value.message?.sId;

      if (!messageId) {
        const errorMsg = "No message created";
        if (setError) {
          setError(errorMsg);
          return;
        }
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
      const errorMsg = `Failed to stream agent answer: ${streamRes.error.message}`;
      if (setError) {
        setError(errorMsg);
        return;
      }
      process.exit(1);
    }

    let fullResponse = "";
    const eventDetails: EventDetail[] = [];

    for await (const event of streamRes.value.eventStream) {
      // If details flag is set, collect all events
      if (showDetails) {
        eventDetails.push({
          ...(event as BaseEvent),
          timestamp: Date.now(),
        });
      }

      if (event.type === "generation_tokens") {
        if (event.classification === "tokens") {
          fullResponse += event.text;
        }
      } else if (event.type === "agent_error") {
        const errorMsg = `Agent error: ${event.error.message}`;
        if (setError) {
          setError(errorMsg);
          return;
        }
        process.exit(1);
      } else if (event.type === "user_message_error") {
        const errorMsg = `User message error: ${event.error.message}`;
        if (setError) {
          setError(errorMsg);
          return;
        }
        process.exit(1);
      } else if (event.type === "agent_generation_cancelled") {
        // Handle generation cancellation
        const output: NonInteractiveOutput = {
          agentId: selectedAgent.sId,
          agentAnswer:
            fullResponse.trim() || "[Message generation was cancelled]",
          conversationId: conversation.sId,
          messageId: event.messageId,
          cancelled: true,
        };

        // Add detailed event history if requested
        if (showDetails) {
          output.events = eventDetails;
        }

        // Exit with special code to indicate cancellation
        process.exit(2);
      } else if (event.type === "agent_message_success") {
        // Success - output the result
        const output: NonInteractiveOutput = {
          agentId: selectedAgent.sId,
          agentAnswer: fullResponse.trim(),
          conversationId: conversation.sId,
          messageId: event.message.sId,
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
    const errorMsg = `Unexpected error: ${normalizeError(error).message}`;
    if (setError) {
      setError(errorMsg);
      return;
    }
    process.exit(1);
  }
}

export function validateNonInteractiveFlags(
  message?: string,
  agentSearch?: string,
  conversationId?: string,
  messageId?: string,
  details?: boolean,
  projectName?: string,
  projectId?: string,
  setError?: (error: string) => void
): void {
  // Check --projectName and --projectId mutual exclusivity
  if (projectName && projectId) {
    const errorMsg =
      "Invalid usage: --projectName and --projectId cannot be used together";
    if (setError) {
      setError(errorMsg);
      return;
    }
    process.exit(1);
  }

  // Check --projectName/--projectId exclusivity with --conversationId
  if ((projectName || projectId) && conversationId) {
    const errorMsg =
      "Invalid usage: --projectName/--projectId cannot be used with --conversationId";
    if (setError) {
      setError(errorMsg);
      return;
    }
    process.exit(1);
  }
  // Check --messageId requirements
  if (messageId && !conversationId) {
    const errorMsg =
      "Invalid usage: --messageId requires --conversationId to be specified";
    if (setError) {
      setError(errorMsg);
      return;
    }
    process.exit(1);
  }

  // Check --messageId exclusivity with other flags
  if (messageId && (agentSearch || message)) {
    const errorMsg =
      "Invalid usage: --messageId cannot be used with --agent or --message";
    if (setError) {
      setError(errorMsg);
      return;
    }
    process.exit(1);
  }

  // Check --details requirements
  if (details && (!agentSearch || !message)) {
    const errorMsg =
      "Invalid usage: --details requires both --agent and --message to be specified";
    if (setError) {
      setError(errorMsg);
      return;
    }
    process.exit(1);
  }

  // Existing validations
  if (message && !agentSearch) {
    const errorMsg =
      "Invalid usage: --message requires --agent to be specified";
    if (setError) {
      setError(errorMsg);
      return;
    }
    process.exit(1);
  }
  if (conversationId && !messageId && (!agentSearch || !message)) {
    const errorMsg =
      "Invalid usage: --conversationId requires both --agent and --message to be specified (or --messageId)";
    if (setError) {
      setError(errorMsg);
      return;
    }
    process.exit(1);
  }
}

export async function fetchAgentMessageFromConversation(
  conversationId: string,
  messageId: string,
  setError?: (error: string) => void
): Promise<void> {
  const dustClientRes = await getDustClient();
  if (dustClientRes.isErr()) {
    const errorMsg = `Failed to get client: ${dustClientRes.error.message}`;
    if (setError) {
      setError(errorMsg);
      return;
    }
    process.exit(1);
  }

  const dustClient = dustClientRes.value;
  if (!dustClient) {
    const errorMsg = "Authentication required: Run `dust login` first";
    if (setError) {
      setError(errorMsg);
      return;
    }
    process.exit(1);
  }

  try {
    // Get conversation with messages
    const convRes = await dustClient.getConversation({
      conversationId: conversationId,
    });

    if (convRes.isErr()) {
      const errorMsg = `Failed to fetch conversation: ${convRes.error.message}`;
      if (setError) {
        setError(errorMsg);
        return;
      }
      process.exit(1);
    }

    const conversation = convRes.value;

    // Find the agent message with the specified sId
    let agentMessage = null;
    for (const contentGroup of conversation.content) {
      for (const msg of contentGroup) {
        if (msg.type === "agent_message" && msg.sId === messageId) {
          agentMessage = msg;
          break;
        }
      }
      if (agentMessage) {
        break;
      }
    }

    if (!agentMessage) {
      const errorMsg = `Message not found: Agent message with ID ${messageId} not found in conversation ${conversationId}`;
      if (setError) {
        setError(errorMsg);
        return;
      }
      process.exit(1);
    }

    // Output the agent message as JSON
    console.log(JSON.stringify(agentMessage));
    process.exit(0);
  } catch (error) {
    const errorMsg = `Unexpected error: ${normalizeError(error).message}`;
    if (setError) {
      setError(errorMsg);
      return;
    }
    process.exit(1);
  }
}
