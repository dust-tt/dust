import type { Transaction } from "sequelize";

import { isUserMention } from "@app/lib/mentions/types";
import {
  AgentMessage,
  Mention,
  Message,
} from "@app/lib/models/assistant/conversation";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import type {
  AgentMention,
  AgentMessageType,
  ConversationType,
  LightAgentConfigurationType,
  MentionType,
  UserMessageType,
  WorkspaceType,
} from "@app/types";
import { isAgentMention } from "@app/types";

// TODO(rcs): probably to put in a resource
export const createAgentMessages = async ({
  mentions,
  agentConfigurations,
  message,
  owner,
  transaction,
  skipToolsValidation,
  nextMessageRank,
  conversation,
  userMessage,
}: {
  mentions: MentionType[];
  agentConfigurations: LightAgentConfigurationType[];
  message: Message;
  owner: WorkspaceType;
  transaction: Transaction;
  skipToolsValidation: boolean;
  nextMessageRank: number;
  conversation: ConversationType;
  userMessage: UserMessageType;
}) => {
  const agentMentions = mentions.filter(isAgentMention);
  const userMentions = mentions.filter(isUserMention);

  const agentMentionPromises = agentMentions.map((mention) => {
    return createAgentMentionsObjects({
      mention,
      agentConfigurations,
      message,
      owner,
      transaction,
      skipToolsValidation,
      nextMessageRank,
      conversation,
      userMessage,
    });
  });
  const userMentionPromises = userMentions.map(() => {
    return Promise.reject(new Error("User mentions not implemented"));
  });

  const results = await Promise.all([
    ...agentMentionPromises,
    ...userMentionPromises,
  ]);

  return results.filter((r) => r !== null) as {
    row: AgentMessage;
    m: AgentMessageType;
  }[];
};

const createAgentMentionsObjects = async ({
  mention,
  agentConfigurations,
  message,
  owner,
  transaction,
  skipToolsValidation,
  nextMessageRank,
  conversation,
  userMessage,
}: {
  mention: AgentMention;
  agentConfigurations: LightAgentConfigurationType[];
  message: Message;
  owner: WorkspaceType;
  transaction: Transaction;
  skipToolsValidation: boolean;
  nextMessageRank: number;
  conversation: ConversationType;
  userMessage: UserMessageType;
}) => {
  // `getAgentConfiguration` checks that we're only pulling a configuration from the
  // same workspace or a global one.
  const configuration = agentConfigurations.find(
    (ac) => ac.sId === mention.configurationId
  );
  if (!configuration) {
    return null;
  }

  await Mention.create(
    {
      messageId: message.id,
      agentConfigurationId: configuration.sId,
      workspaceId: owner.id,
    },
    { transaction }
  );

  const agentMessageRow = await AgentMessage.create(
    {
      status: "created",
      agentConfigurationId: configuration.sId,
      agentConfigurationVersion: configuration.version,
      workspaceId: owner.id,
      skipToolsValidation,
    },
    { transaction }
  );
  const messageRow = await Message.create(
    {
      sId: generateRandomModelSId(),
      rank: nextMessageRank++,
      conversationId: conversation.id,
      parentId: userMessage.id,
      agentMessageId: agentMessageRow.id,
      workspaceId: owner.id,
    },
    { transaction }
  );

  const parentAgentMessageId =
    userMessage.context.origin === "agent_handover"
      ? userMessage.context.originMessageId ?? null
      : null;

  return {
    row: agentMessageRow,
    m: {
      id: messageRow.id,
      agentMessageId: agentMessageRow.id,
      created: agentMessageRow.createdAt.getTime(),
      completedTs: agentMessageRow.completedAt?.getTime() ?? null,
      sId: messageRow.sId,
      type: "agent_message",
      visibility: "visible",
      version: 0,
      parentMessageId: userMessage.sId,
      parentAgentMessageId,
      status: "created",
      actions: [],
      content: null,
      chainOfThought: null,
      rawContents: [],
      error: null,
      configuration,
      rank: messageRow.rank,
      skipToolsValidation: agentMessageRow.skipToolsValidation,
      contents: [],
      parsedContents: {},
    } satisfies AgentMessageType,
  };
};
