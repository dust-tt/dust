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
  conversationId: string;
  userMessageId: string;
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

  const { agentMessageId, conversationId, userMessageId } = runAgentArgs.idArgs;
  const conversationRes = await getConversation(auth, conversationId);
  if (conversationRes.isErr()) {
    return new Err(
      new Error(`Conversation not found: ${conversationRes.error.message}`)
    );
  }

  const conversation = conversationRes.value;

  // Here, we assume that both the user message and agent message have been added to the
  // conversation.content array. Flatten all message arrays to find individual messages.
  const allMessages = conversation.content.flat();

  const userMessage = allMessages.find(
    (m) => m.sId === userMessageId && isUserMessageType(m)
  );
  if (!userMessage || !isUserMessageType(userMessage)) {
    return new Err(new Error("User message not found"));
  }

  const agentMessage = allMessages.find(
    (m) => m.sId === agentMessageId && isAgentMessageType(m)
  );
  if (!agentMessage || !isAgentMessageType(agentMessage)) {
    return new Err(new Error("Agent message not found"));
  }

  // Get the AgentMessage database row by querying through Message model.
  const agentMessageRow = await Message.findOne({
    where: {
      sId: agentMessageId,
      workspaceId: auth.getNonNullableWorkspace().id,
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
