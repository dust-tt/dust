import type { Transaction } from "sequelize";

import { getUserForWorkspace } from "@app/lib/api/user";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import {
  AgentMessage,
  Mention,
  Message,
} from "@app/lib/models/assistant/conversation";
import { triggerConversationAddedAsParticipantNotification } from "@app/lib/notifications/workflows/conversation-added-as-participant";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import type { MentionType } from "@app/types";
import type {
  AgentMessageType,
  ConversationType,
  LightAgentConfigurationType,
  UserMessageType,
  WorkspaceType,
} from "@app/types";
import { isAgentMention, isUserMention } from "@app/types";

export const createUserMentions = async (
  auth: Authenticator,
  {
    mentions,
    message,
    conversation,
    transaction,
  }: {
    mentions: MentionType[];
    message: Message;
    conversation: ConversationType;
    transaction?: Transaction;
  }
) => {
  // Store user mentions in the database
  await Promise.all(
    mentions.filter(isUserMention).map(async (mention) => {
      // check if the user exists in the workspace before creating the mention
      const user = await getUserForWorkspace(auth, { userId: mention.userId });
      if (user) {
        await Mention.create(
          {
            messageId: message.id,
            userId: user.id,
            workspaceId: auth.getNonNullableWorkspace().id,
          },
          { transaction }
        );

        const status = await ConversationResource.upsertParticipation(auth, {
          conversation,
          action: "subscribed",
          user: user.toJSON(),
        });

        const featureFlags = await getFeatureFlags(
          auth.getNonNullableWorkspace()
        );

        if (status === "added" && featureFlags.includes("notifications")) {
          await triggerConversationAddedAsParticipantNotification(auth, {
            conversation,
            addedUserId: user.sId,
          });
        }
      }
    })
  );
};

export const createAgentMessages = async ({
  mentions,
  agentConfigurations,
  message,
  owner,
  skipToolsValidation,
  nextMessageRank,
  conversation,
  userMessage,
  transaction,
}: {
  mentions: MentionType[];
  agentConfigurations: LightAgentConfigurationType[];
  message: Message;
  owner: WorkspaceType;
  skipToolsValidation: boolean;
  nextMessageRank: number;
  conversation: ConversationType;
  userMessage: UserMessageType;
  transaction?: Transaction;
}) => {
  const results = await Promise.all(
    mentions.filter(isAgentMention).map((mention) => {
      // For each assistant/agent mention, create an "empty" agent message.
      return (async () => {
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
          userMessage.runAgentContext?.type === "agent_handover"
            ? (userMessage.runAgentContext?.originMessageId ?? null)
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
            modelInteractionDurationMs:
              agentMessageRow.modelInteractionDurationMs,
          } satisfies AgentMessageType,
        };
      })();
    })
  );

  return results.filter((r) => r !== null) as {
    row: AgentMessage;
    m: AgentMessageType;
  }[];
};
