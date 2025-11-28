import type { Transaction } from "sequelize";

import { getUserForWorkspace } from "@app/lib/api/user";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import {
  AgentMessage,
  Mention,
  Message,
} from "@app/lib/models/agent/conversation";
import { triggerConversationAddedAsParticipantNotification } from "@app/lib/notifications/workflows/conversation-added-as-participant";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import type { ConversationWithoutContentType, MentionType } from "@app/types";
import type {
  AgentMessageType,
  LightAgentConfigurationType,
  UserMessageType,
  WorkspaceType,
} from "@app/types";
import { assertNever, isAgentMention, isUserMention } from "@app/types";

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
    conversation: ConversationWithoutContentType;
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
  owner,
  conversation,
  metadata,
  transaction,
}: {
  owner: WorkspaceType;
  conversation: ConversationWithoutContentType;
  metadata:
    | {
        type: "retry";
      }
    | {
        type: "create";
        mentions: MentionType[];
        agentConfigurations: LightAgentConfigurationType[];
        message: Message;
        skipToolsValidation: boolean;
        nextMessageRank: number;
        userMessage: UserMessageType;
      };
  transaction?: Transaction;
}) => {
  switch (metadata.type) {
    case "retry":
      throw new Error("Not implemented");

    case "create":
      const results = await Promise.all(
        metadata.mentions.filter(isAgentMention).map((mention) => {
          // For each assistant/agent mention, create an "empty" agent message.
          return (async () => {
            // `getAgentConfiguration` checks that we're only pulling a configuration from the
            // same workspace or a global one.
            const configuration = metadata.agentConfigurations.find(
              (ac) => ac.sId === mention.configurationId
            );
            if (!configuration) {
              return null;
            }

            await Mention.create(
              {
                messageId: metadata.message.id,
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
                skipToolsValidation: metadata.skipToolsValidation,
              },
              { transaction }
            );
            const messageRow = await Message.create(
              {
                sId: generateRandomModelSId(),
                rank: metadata.nextMessageRank++,
                conversationId: conversation.id,
                parentId: metadata.userMessage.id,
                agentMessageId: agentMessageRow.id,
                workspaceId: owner.id,
              },
              { transaction }
            );

            const parentAgentMessageId =
              metadata.userMessage.agenticMessageData?.type === "agent_handover"
                ? (metadata.userMessage.agenticMessageData?.originMessageId ??
                  null)
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
                parentMessageId: metadata.userMessage.sId,
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
      break;
    default:
      assertNever(metadata);
  }
};
