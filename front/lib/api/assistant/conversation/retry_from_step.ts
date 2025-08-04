import { runAgentLoop } from "@app/lib/api/assistant/agent";
import { getFullAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import type { Authenticator } from "@app/lib/auth";
import { AgentMessage, Message } from "@app/lib/models/assistant/conversation";
import type {
  AgentMessageType,
  AgentMessageWithRankType,
  APIErrorWithStatusCode,
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
): Promise<Result<AgentMessageWithRankType, APIErrorWithStatusCode>> {
  // First, find the array of the parent message in conversation.content.
  const parentMessageIndex = conversation.content.findIndex((messages) => {
    return messages.some((m) => m.sId === agentMessage.parentMessageId);
  });
  if (parentMessageIndex === -1) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "message_not_found",
        message: `Parent message ${agentMessage.parentMessageId} not found in conversation`,
      },
    });
  }

  const userMessage =
    conversation.content[parentMessageIndex][
      conversation.content[parentMessageIndex].length - 1
    ];
  if (!isUserMessageType(userMessage)) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "message_not_found",
        message: "Parent message must be a user message",
      },
    });
  }

  const messageRow = await Message.findOne({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      conversationId: conversation.id,
      id: agentMessage.id,
    },
    include: [
      {
        model: AgentMessage,
        as: "agentMessage",
        required: true,
      },
    ],
  });
  if (!messageRow) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "message_not_found",
        message: `Message row ${agentMessage.id} not found`,
      },
    });
  }

  // we need to refetch by why?
  const agentMessageRow = await AgentMessage.findOne({
    where: {
      id: agentMessage.agentMessageId,
      workspaceId: conversation.owner.id,
    },
  });
  if (!agentMessageRow) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "message_not_found",
        message: `Agent message row ${agentMessage.id} not found`,
      },
    });
  }

  const agentMessageWithRank: AgentMessageWithRankType = {
    ...agentMessage,
    rank: messageRow.rank,
  };

  const inMemoryData = {
    agentConfiguration: await getFullAgentConfiguration(
      auth,
      agentMessage.configuration
    ),
    conversation,
    userMessage,
    agentMessage: {
      ...agentMessage,
      content: "", // reset agentMessage content
    },
    agentMessageRow,
  };

  void runAgentLoop(
    auth.toJSON(),
    { sync: true, inMemoryData },
    { forceAsynchronousLoop: false, startStep }
  );

  return new Ok(agentMessageWithRank);
}
