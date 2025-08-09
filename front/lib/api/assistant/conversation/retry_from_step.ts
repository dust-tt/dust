import { runAgentLoop } from "@app/lib/api/assistant/agent";
import type { Authenticator } from "@app/lib/auth";
import { AgentMessage } from "@app/lib/models/assistant/conversation";
import type {
  AgentMessageType,
  APIError,
  ConversationType,
  Result,
} from "@app/types";
import { Err, isUserMessageType, Ok } from "@app/types";

export async function retryAgentMessageFromStep(
  auth: Authenticator,
  {
    conversation,
    agentMessage,
    startStep,
  }: {
    conversation: ConversationType;
    agentMessage: AgentMessageType;
    startStep: number;
  }
): Promise<Result<{}, APIError>> {
  // First, find the array of the parent message in conversation.content.
  const parentMessageIndex = conversation.content.findIndex((messages) => {
    return messages.some((m) => m.sId === agentMessage.parentMessageId);
  });
  if (parentMessageIndex === -1) {
    return new Err({
      type: "message_not_found",
      message: `Parent message ${agentMessage.parentMessageId} not found in conversation`,
    });
  }

  const userMessage =
    conversation.content[parentMessageIndex][
      conversation.content[parentMessageIndex].length - 1
    ];
  if (!isUserMessageType(userMessage)) {
    return new Err({
      type: "message_not_found",
      message: "Parent message must be a user message",
    });
  }

  void runAgentLoop(
    auth.toJSON(),
    {
      sync: false,
      idArgs: {
        agentMessageId: agentMessage.sId,
        agentMessageVersion: agentMessage.version,
        conversationId: conversation.sId,
        conversationTitle: conversation.title,
        userMessageId: userMessage.sId,
        userMessageVersion: userMessage.version,
      },
    },
    { forceAsynchronousLoop: false, startStep }
  );

  return new Ok({});
}
