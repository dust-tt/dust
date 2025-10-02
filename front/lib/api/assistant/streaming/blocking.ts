import { postUserMessage } from "@app/lib/api/assistant/conversation";
import {
  getMessageChannelId,
  isEndOfStreamEvent,
} from "@app/lib/api/assistant/streaming/helpers";
import { getRedisHybridManager } from "@app/lib/api/redis-hybrid-manager";
import type { Authenticator } from "@app/lib/auth";
import type {
  AgentMessageType,
  ConversationType,
  MentionType,
  PubSubError,
  Result,
  UserMessageContext,
  UserMessageType,
} from "@app/types";
import { Ok } from "@app/types";
import type { ExecutionMode } from "@app/types/assistant/agent_run";

// We wait for 60 seconds for agent messages to complete.
const WAIT_FOR_AGENT_COMPLETION_TIMEOUT_MS = 60000 * 3; // 3 minutes.

/**
 * Waits for all agent messages to complete by subscribing to their Redis channels and listening
 * for "end-of-stream" events. This function is used to implement blocking behavior for public API
 * endpoints that need to wait for agent responses.
 *
 * @param agentMessages - Array of agent messages to wait for completion
 * @returns Promise that resolves with the completed agent messages
 *
 * The function:
 * - Subscribes to each agent message's Redis channel
 * - Listens for "end-of-stream" or "close" events to detect completion
 * - Handles agent errors by removing failed messages from the expected set
 * - Times out after `WAIT_FOR_AGENT_COMPLETION_TIMEOUT_MS` milliseconds to prevent hanging
 * - Cleans up all subscriptions when done to avoid memory leaks
 */
async function waitForAgentCompletion(
  agentMessages: AgentMessageType[]
): Promise<AgentMessageType[]> {
  if (agentMessages.length === 0) {
    return [];
  }

  return new Promise<AgentMessageType[]>((resolve) => {
    const completedMessages: AgentMessageType[] = [];
    const expectedMessageIds = new Set(agentMessages.map((m) => m.sId));
    const subscriptions: (() => void)[] = [];
    let isResolved = false;

    const cleanup = () => {
      if (isResolved) {
        return;
      }
      isResolved = true;

      // Clean up all subscriptions.
      subscriptions.forEach((unsub) => {
        try {
          unsub();
        } catch (error) {
          // Ignore individual unsubscribe errors to ensure all subscriptions are cleaned up.
        }
      });
    };

    const checkCompletion = () => {
      if (expectedMessageIds.size === 0) {
        cleanup();
        return resolve(completedMessages);
      }
    };

    const setupSubscriptions = async () => {
      for (const agentMessage of agentMessages) {
        const messageChannel = getMessageChannelId(agentMessage.sId);

        try {
          const { unsubscribe } = await getRedisHybridManager().subscribe(
            messageChannel,
            (event) => {
              if (isResolved) {
                return;
              }

              const parsedEvent =
                event === "close" ? "close" : JSON.parse(event.message.payload);

              if (parsedEvent.type === "agent_message_success") {
                // Use the complete message from the success event.
                completedMessages.push(parsedEvent.message);
              }

              if (parsedEvent === "close" || isEndOfStreamEvent(parsedEvent)) {
                // If we somehow get close without success, use original.
                if (
                  expectedMessageIds.has(agentMessage.sId) &&
                  !completedMessages.some((m) => m.sId === agentMessage.sId)
                ) {
                  completedMessages.push(agentMessage);
                }

                expectedMessageIds.delete(agentMessage.sId);
                checkCompletion();
              }

              if (parsedEvent.type === "agent_error") {
                expectedMessageIds.delete(parsedEvent.messageId);
                checkCompletion();
              }
            },
            null, // lastEventId.
            "user_message_events"
          );

          subscriptions.push(unsubscribe);
        } catch (error) {
          expectedMessageIds.delete(agentMessage.sId);
        }
      }

      // Check if all subscriptions failed.
      checkCompletion();
    };

    setTimeout(() => {
      if (!isResolved) {
        cleanup();
        return resolve(completedMessages);
      }
    }, WAIT_FOR_AGENT_COMPLETION_TIMEOUT_MS);

    // Start subscription setup.
    setupSubscriptions().catch(() => {
      // If setup fails completely, resolve with empty results.
      cleanup();
      return resolve([]);
    });
  });
}

export async function postUserMessageAndWaitForCompletion(
  auth: Authenticator,
  {
    content,
    context,
    conversation,
    // TODO(pr) remove in follow-up pr.
    _executionMode,
    mentions,
    skipToolsValidation,
  }: {
    content: string;
    context: UserMessageContext;
    conversation: ConversationType;
    _executionMode?: ExecutionMode;
    mentions: MentionType[];
    skipToolsValidation: boolean;
  }
): Promise<
  Result<
    {
      userMessage: UserMessageType;
      agentMessages: AgentMessageType[];
    },
    PubSubError
  >
> {
  const postResult = await postUserMessage(auth, {
    content,
    context,
    conversation,
    mentions,
    skipToolsValidation,
  });

  if (postResult.isErr()) {
    return postResult;
  }

  const { userMessage, agentMessages } = postResult.value;
  if (agentMessages.length === 0) {
    return new Ok({ userMessage, agentMessages });
  }

  // Wait for all agent messages to complete.
  const completedAgentMessages = await waitForAgentCompletion(agentMessages);

  return new Ok({
    userMessage,
    agentMessages: completedAgentMessages,
  });
}
