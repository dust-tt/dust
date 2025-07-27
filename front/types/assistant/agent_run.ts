/**
 * Run agent arguments
 */

import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";

import { getAgentConfiguration } from "@app/lib/api/assistant/configuration";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { AgentMessage, Message } from "@app/lib/models/assistant/conversation";
import type { AgentConfigurationType } from "@app/types/assistant/agent";
import type {
  AgentMessageType,
  ConversationType,
  UserMessageType,
} from "@app/types/assistant/conversation";
import {
  isAgentMessageType,
  isUserMessageType,
} from "@app/types/assistant/conversation";

export type RunAgentAsynchronousArgs = {
  agentMessageId: string;
  agentMessageVersion: number;
  conversationId: string;
  conversationTitle: string | null;
  userMessageId: string;
  userMessageVersion: number;
};

export type RunAgentSynchronousArgs = {
  agentConfiguration: AgentConfigurationType;
  agentMessage: AgentMessageType;
  agentMessageRow: AgentMessage;
  conversation: ConversationType;
  userMessage: UserMessageType;
};

export type RunAgentArgs =
  | {
      sync: true;
      inMemoryData: RunAgentSynchronousArgs;
    }
  | {
      sync: false;
      idArgs: RunAgentAsynchronousArgs;
    };

export async function getRunAgentData(
  authType: AuthenticatorType,
  runAgentArgs: RunAgentArgs
): Promise<Result<RunAgentSynchronousArgs, Error>> {
  if (runAgentArgs.sync) {
    return new Ok(runAgentArgs.inMemoryData);
  }

  const auth = await Authenticator.fromJSON(authType);

  const {
    agentMessageId,
    agentMessageVersion,
    conversationId,
    userMessageId,
    userMessageVersion,
  } = runAgentArgs.idArgs;
  const conversationRes = await getConversation(auth, conversationId);
  if (conversationRes.isErr()) {
    return new Err(
      new Error(`Conversation not found: ${conversationRes.error.message}`)
    );
  }

  const conversation = conversationRes.value;

  // Find the agent message group by searching in reverse order.
  // All messages of the same group should be of the same type and of same sId.
  // For safety, this is asserted below.
  const agentMessageGroup = conversation.content.findLast(
    (messageGroup) => messageGroup[0]?.sId === agentMessageId
  );

  const agentMessage = agentMessageGroup?.[agentMessageVersion];

  if (
    !agentMessage ||
    !isAgentMessageType(agentMessage) ||
    agentMessage.sId !== agentMessageId ||
    agentMessage.version !== agentMessageVersion
  ) {
    return new Err(new Error("Agent message not found"));
  }

  // Find the user message group by searching in reverse order.
  const userMessageGroup = conversation.content.findLast(
    (messageGroup) => messageGroup[0]?.sId === userMessageId
  );

  // We assume that the message group is ordered by version ASC. Message version starts from 0.
  const userMessage = userMessageGroup?.[userMessageVersion];

  if (
    !userMessage ||
    !isUserMessageType(userMessage) ||
    userMessage.sId !== userMessageId ||
    userMessage.version !== userMessageVersion
  ) {
    return new Err(new Error("Unexpected: User message not found"));
  }

  // Get the AgentMessage database row by querying through Message model.
  const agentMessageRow = await Message.findOne({
    where: {
      // Leveraging the index on workspaceId, conversationId, sId.
      conversationId: conversation.id,
      sId: agentMessageId,
      workspaceId: auth.getNonNullableWorkspace().id,
      // No proper index on version.
      version: agentMessageVersion,
    },
    include: [
      {
        model: AgentMessage,
        as: "agentMessage",
        required: true,
      },
    ],
  });

  if (!agentMessageRow?.agentMessage) {
    return new Err(new Error("Agent message database row not found"));
  }

  // Fetch the agent configuration as we need the full version of the agent configuration.
  const agentConfiguration = await getAgentConfiguration(
    auth,
    agentMessage.configuration.sId,
    "full"
  );
  if (!agentConfiguration) {
    return new Err(new Error("Agent configuration not found"));
  }

  return new Ok({
    agentMessage,
    agentMessageRow: agentMessageRow.agentMessage,
    conversation,
    userMessage,
    agentConfiguration,
  });
}
