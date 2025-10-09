/**
 * Run agent arguments
 */
import { getAgentConfiguration } from "@app/lib/api/assistant/configuration/agent";
import { getConversation } from "@app/lib/api/assistant/conversation/fetch";
import type { AuthenticatorType } from "@app/lib/auth";
import { Authenticator } from "@app/lib/auth";
import { AgentMessage, Message } from "@app/lib/models/assistant/conversation";
import type { Result } from "@app/types";
import { Err, isGlobalAgentId, Ok } from "@app/types";
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

export type AgentLoopArgs = {
  agentMessageId: string;
  agentMessageVersion: number;
  conversationId: string;
  conversationTitle: string | null;
  userMessageId: string;
  userMessageVersion: number;
};

export type AgentLoopExecutionData = {
  agentConfiguration: AgentConfigurationType;
  agentMessage: AgentMessageType;
  agentMessageRow: AgentMessage;
  conversation: ConversationType;
  userMessage: UserMessageType;
};

export type AgentLoopArgsWithTiming = AgentLoopArgs & {
  initialStartTime: number;
};

export async function getAgentLoopData(
  authType: AuthenticatorType,
  agentLoopArgs: AgentLoopArgs
): Promise<Result<AgentLoopExecutionData & { auth: Authenticator }, Error>> {
  const auth = await Authenticator.fromJSON(authType);

  const {
    agentMessageId,
    agentMessageVersion,
    conversationId,
    userMessageId,
    userMessageVersion,
  } = agentLoopArgs;
  const conversationRes = await getConversation(auth, conversationId);
  if (conversationRes.isErr()) {
    return conversationRes;
  }

  const conversation = conversationRes.value;

  // Find the agent message by searching all groups in reverse order. Retried messages do not have
  // the same sId as the original message, so we need to search all groups.
  let agentMessage: AgentMessageType | undefined;
  for (let i = conversation.content.length - 1; i >= 0 && !agentMessage; i--) {
    const messageGroup = conversation.content[i];
    for (const msg of messageGroup) {
      if (
        isAgentMessageType(msg) &&
        msg.sId === agentMessageId &&
        msg.version === agentMessageVersion
      ) {
        agentMessage = msg;
        break;
      }
    }
  }

  if (!agentMessage) {
    return new Err(new Error("Agent message not found"));
  }

  // Find the user message group by searching in reverse order.
  const userMessageGroup = conversation.content.findLast((messageGroup) =>
    messageGroup.some((m) => m.sId === userMessageId)
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
  const agentConfiguration = await getAgentConfiguration(auth, {
    agentId: agentMessage.configuration.sId,
    // We do define agentMessage.configuration.version for global agent, ignoring this value here.
    agentVersion: isGlobalAgentId(agentMessage.configuration.sId)
      ? undefined
      : agentMessage.configuration.version,
    variant: "full",
  });
  if (!agentConfiguration) {
    return new Err(new Error("Agent configuration not found"));
  }

  return new Ok({
    agentConfiguration,
    agentMessage,
    agentMessageRow: agentMessageRow.agentMessage,
    auth,
    conversation,
    userMessage,
  });
}
