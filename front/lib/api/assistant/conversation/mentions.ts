import uniq from "lodash/uniq";
import type { Transaction } from "sequelize";
import { Op } from "sequelize";

import { signalAgentUsage } from "@app/lib/api/assistant/agent_usage";
import { getAgentConfigurations } from "@app/lib/api/assistant/configuration/agent";
import { getContentFragmentSpaceIds } from "@app/lib/api/assistant/permissions";
import { getUserForWorkspace } from "@app/lib/api/user";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import {
  AgentMessageModel,
  MentionModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { triggerConversationAddedAsParticipantNotification } from "@app/lib/notifications/workflows/conversation-added-as-participant";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import {
  generateRandomModelSId,
  getResourceIdFromSId,
} from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";
import { isEmailValid } from "@app/lib/utils";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type {
  AgenticMessageData,
  AgentMessageType,
  ContentFragmentInputWithContentNode,
  ConversationWithoutContentType,
  MentionType,
  MessageType,
  MessageVisibility,
  ModelId,
  RichMention,
  UserMessageContext,
  UserType,
} from "@app/types";
import type {
  LightAgentConfigurationType,
  UserMessageType,
  WorkspaceType,
} from "@app/types";
import {
  assertNever,
  isAgentMention,
  isUserMention,
  removeNulls,
  toMentionType,
  toRichAgentMentionType,
  toRichUserMentionType,
} from "@app/types";

import { runAgentLoopWorkflow } from "./agent_loop";

export const createUserMentions = async (
  auth: Authenticator,
  {
    mentions,
    message,
    conversation,
    transaction,
  }: {
    mentions: MentionType[];
    message: MessageType;
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
        await MentionModel.create(
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

async function attributeUserFromWorkspaceAndEmail(
  workspace: WorkspaceType | null,
  email: string | null
): Promise<UserType | null> {
  if (!workspace || !email || !isEmailValid(email)) {
    return null;
  }

  const matchingUser = await UserResource.fetchByEmail(email);
  if (!matchingUser) {
    return null;
  }

  const membership =
    await MembershipResource.getActiveMembershipOfUserInWorkspace({
      user: matchingUser,
      workspace,
    });

  return membership ? matchingUser.toJSON() : null;
}

/**
 * Update the conversation requestedSpaceIds based on the mentioned agents. This function is purely
 * additive - requirements are never removed.
 *
 * Each agent's requestedSpaceIds represents a set of requirements that must be satisfied. When an
 * agent is mentioned in a conversation, its requirements are added to the conversation's
 * requirements.
 *
 * - Within each requirement (sub-array), groups are combined with OR logic.
 * - Different requirements (different sub-arrays) are combined with AND logic.
 */
export async function updateConversationRequirements(
  auth: Authenticator,
  {
    agents,
    contentFragment,
    conversation,
    t,
  }: {
    agents?: LightAgentConfigurationType[];
    contentFragment?: ContentFragmentInputWithContentNode;
    conversation: ConversationWithoutContentType;
    t?: Transaction;
  }
): Promise<void> {
  let newSpaceRequirements: string[] = [];
  if (agents) {
    newSpaceRequirements = agents.flatMap((agent) => agent.requestedSpaceIds);
  }
  if (contentFragment) {
    const requestedSpaceId = await getContentFragmentSpaceIds(
      auth,
      contentFragment
    );

    newSpaceRequirements.push(requestedSpaceId);
  }

  newSpaceRequirements = uniq(newSpaceRequirements);

  const currentSpaceRequirements = conversation.requestedSpaceIds;

  const areAllSpaceRequirementsPresent = newSpaceRequirements.every((newReq) =>
    currentSpaceRequirements.includes(newReq)
  );

  // Early return if all new requirements are already present.
  if (areAllSpaceRequirementsPresent) {
    return;
  }

  // Get missing requirements.
  const spaceRequirementsToAdd = newSpaceRequirements.filter(
    (newReq) => !currentSpaceRequirements.includes(newReq)
  );

  // Convert all sIds to modelIds.
  const sIdToModelId = new Map<string, number>();
  const getModelId = (sId: string) => {
    if (!sIdToModelId.has(sId)) {
      const id = getResourceIdFromSId(sId);
      if (id === null) {
        throw new Error("Unexpected: invalid group id");
      }
      sIdToModelId.set(sId, id);
    }
    return sIdToModelId.get(sId)!;
  };

  const allSpaceRequirements = [
    ...currentSpaceRequirements.map(getModelId),
    ...spaceRequirementsToAdd.map(getModelId),
  ];

  await ConversationResource.updateRequirements(
    auth,
    conversation.sId,
    allSpaceRequirements,
    t
  );
}

export async function createUserMessage(
  auth: Authenticator,
  {
    conversation,
    metadata,
    content,
    mentions,
    transaction,
  }: {
    conversation: ConversationWithoutContentType;
    content: string;
    mentions: MentionType[];
    metadata:
      | {
          type: "edit";
          message: UserMessageType;
        }
      | {
          type: "delete";
          message: UserMessageType;
        }
      | {
          type: "create";
          user: UserType | null;
          rank: number;
          context: UserMessageContext;
          agenticMessageData?: AgenticMessageData;
        };
    transaction: Transaction;
  }
) {
  const workspace = auth.getNonNullableWorkspace();
  let rank = 0;
  let version = 0;
  let parentId: ModelId | null = null;
  let user: UserType | null = null;

  let context: UserMessageContext | null = null;
  let agenticMessageData: AgenticMessageData | undefined = undefined;
  let visibility: MessageVisibility = "visible";

  switch (metadata.type) {
    case "edit":
      // In case of edit, we use the message metadata to create the updated user message.
      rank = metadata.message.rank;
      version = metadata.message.version + 1;
      parentId = metadata.message.id;
      user = metadata.message.user;

      context = metadata.message.context;
      agenticMessageData = metadata.message.agenticMessageData;
      break;
    case "delete":
      // In case of delete, we use the message metadata to delete the user message.
      rank = metadata.message.rank;
      version = metadata.message.version + 1;
      parentId = metadata.message.id;
      user = metadata.message.user;

      context = metadata.message.context;
      agenticMessageData = metadata.message.agenticMessageData;
      visibility = "deleted";
      break;
    case "create":
      // Otherwise, we create a new user message from the metadata.
      rank = metadata.rank;

      // TODO: this allow spoofing as we trust blindly the user email from the metadata.
      user =
        metadata.user ??
        (await attributeUserFromWorkspaceAndEmail(
          workspace,
          metadata.context.email
        ));

      context = metadata.context;
      agenticMessageData = metadata.agenticMessageData;
      break;
    default:
      assertNever(metadata);
  }

  // Fetch originMessage to ensure it exists and that it's an agent message.
  const originMessageId = agenticMessageData?.originMessageId;
  const originMessage = originMessageId
    ? await MessageModel.findOne({
        where: {
          workspaceId: workspace.id,
          sId: originMessageId,
          agentMessageId: { [Op.not]: null },
        },
      })
    : null;

  if (agenticMessageData?.originMessageId && !originMessage) {
    logger.warn(
      {
        originMessageId,
        workspaceId: workspace.id,
      },
      "Origin message not found"
    );
  }

  // Only set agenticMessageType and agenticOriginMessageId if originMessage exists
  // The model validation requires both to be set together
  const agenticMessageType = originMessage ? agenticMessageData?.type : null;
  const agenticOriginMessageId = originMessage?.sId ?? null;
  const userMessage = await UserMessageModel.create(
    {
      content,
      // TODO(MCP Clean-up): Rename field in DB.
      clientSideMCPServerIds: context.clientSideMCPServerIds ?? [],
      userContextUsername: context.username,
      userContextTimezone: context.timezone,
      userContextFullName: context.fullName,
      userContextEmail: context.email,
      userContextProfilePictureUrl: context.profilePictureUrl,
      userContextOrigin: context.origin,
      userContextLastTriggerRunAt: context.lastTriggerRunAt
        ? new Date(context.lastTriggerRunAt)
        : null,
      agenticMessageType,
      agenticOriginMessageId,
      userId: user?.id,
      workspaceId: workspace.id,
    },
    { transaction }
  );

  const m = await MessageModel.create(
    {
      sId: generateRandomModelSId(),
      rank,
      conversationId: conversation.id,
      parentId,
      version,
      userMessageId: userMessage.id,
      workspaceId: workspace.id,
      visibility,
    },
    {
      transaction,
    }
  );

  const mentionUserIds = mentions.filter(isUserMention).map((m) => m.userId);
  const mentionAgentConfigurationIds = mentions
    .filter(isAgentMention)
    .map((m) => m.configurationId);

  const [mentionnedUsers, mentionnedAgentConfigurations] = await Promise.all([
    mentionUserIds.length > 0 ? UserResource.fetchByIds(mentionUserIds) : [],
    mentionAgentConfigurationIds.length > 0
      ? getAgentConfigurations(auth, {
          agentIds: mentionAgentConfigurationIds,
          variant: "extra_light",
        })
      : [],
  ]);
  const mentionnedUsersBySId = new Map(
    mentionnedUsers.map((u) => [u.sId, u.toJSON()])
  );
  const mentionnedAgentConfigurationsBySId = new Map(
    mentionnedAgentConfigurations.map((ac) => [ac.sId, ac])
  );

  const richMentions: RichMention[] = removeNulls(
    mentions.map((m) => {
      if (isUserMention(m)) {
        const mentionnedUser = mentionnedUsersBySId.get(m.userId);
        if (mentionnedUser) {
          return toRichUserMentionType(mentionnedUser);
        }
      } else if (isAgentMention(m)) {
        const mentionnedAgentConfiguration =
          mentionnedAgentConfigurationsBySId.get(m.configurationId);
        if (mentionnedAgentConfiguration) {
          return toRichAgentMentionType(mentionnedAgentConfiguration);
        }
      } else {
        assertNever(m);
      }
    })
  );
  const createdUserMessage: UserMessageType = {
    id: m.id,
    created: m.createdAt.getTime(),
    sId: m.sId,
    type: "user_message",
    visibility: m.visibility,
    version: m.version,
    user,
    // Use the rich mentions to create the mentions so we exclude the one that do not exists in the database.
    mentions: richMentions.map(toMentionType),
    richMentions,
    content,
    context,
    agenticMessageData: agenticMessageData ?? undefined,
    rank: m.rank,
  };
  return createdUserMessage;
}

export const createAgentMessages = async (
  auth: Authenticator,
  {
    conversation,
    metadata,
    transaction,
  }: {
    conversation: ConversationWithoutContentType;
    metadata:
      | {
          type: "retry";
          agentMessage: AgentMessageType;
          parentId: number;
        }
      | {
          type: "delete";
          agentMessage: AgentMessageType;
          parentId: number;
        }
      | {
          type: "create";
          mentions: MentionType[];
          agentConfigurations: LightAgentConfigurationType[];
          skipToolsValidation: boolean;
          nextMessageRank: number;
          userMessage: UserMessageType;
        };
    transaction?: Transaction;
  }
) => {
  const owner = auth.getNonNullableWorkspace();
  const results: {
    agentMessageRow: AgentMessageModel;
    messageRow: MessageModel;
    configuration: LightAgentConfigurationType;
    parentMessageId: string;
    parentAgentMessageId: string | null;
  }[] = [];

  switch (metadata.type) {
    case "retry":
      {
        const agentConfiguration = metadata.agentMessage.configuration;
        const agentMessageRow = await AgentMessageModel.create(
          {
            status: "created",
            agentConfigurationId: agentConfiguration.sId,
            agentConfigurationVersion: agentConfiguration.version,
            workspaceId: owner.id,
            skipToolsValidation: metadata.agentMessage.skipToolsValidation,
          },
          { transaction }
        );
        const messageRow = await MessageModel.create(
          {
            sId: generateRandomModelSId(),
            rank: metadata.agentMessage.rank,
            conversationId: conversation.id,
            parentId: metadata.parentId,
            version: metadata.agentMessage.version + 1,
            agentMessageId: agentMessageRow.id,
            workspaceId: owner.id,
          },
          {
            transaction,
          }
        );

        results.push({
          agentMessageRow,
          messageRow,
          parentMessageId: metadata.agentMessage.parentMessageId,
          parentAgentMessageId: metadata.agentMessage.parentAgentMessageId,
          configuration: metadata.agentMessage.configuration,
        });
      }
      break;

    case "delete":
      {
        const agentConfiguration = metadata.agentMessage.configuration;
        const agentMessageRow = await AgentMessageModel.create({
          status: "cancelled",
          agentConfigurationId: agentConfiguration.sId,
          agentConfigurationVersion: agentConfiguration.version,
          workspaceId: owner.id,
          skipToolsValidation: metadata.agentMessage.skipToolsValidation,
        });
        const messageRow = await MessageModel.create(
          {
            sId: generateRandomModelSId(),
            rank: metadata.agentMessage.rank,
            conversationId: conversation.id,
            parentId: metadata.parentId,
            version: metadata.agentMessage.version + 1,
            agentMessageId: agentMessageRow.id,
            workspaceId: owner.id,
            visibility: "deleted",
          },
          {
            transaction,
          }
        );

        results.push({
          agentMessageRow,
          messageRow,
          parentMessageId: metadata.agentMessage.parentMessageId,
          parentAgentMessageId: metadata.agentMessage.parentAgentMessageId,
          configuration: metadata.agentMessage.configuration,
        });
      }
      break;

    case "create":
      {
        await concurrentExecutor(
          metadata.mentions.filter(isAgentMention),
          async (mention) => {
            const configuration = metadata.agentConfigurations.find(
              (ac) => ac.sId === mention.configurationId
            );
            if (!configuration) {
              return;
            }

            await MentionModel.create(
              {
                messageId: metadata.userMessage.id,
                agentConfigurationId: configuration.sId,
                workspaceId: owner.id,
              },
              { transaction }
            );

            const agentMessageRow = await AgentMessageModel.create(
              {
                status: "created",
                agentConfigurationId: configuration.sId,
                agentConfigurationVersion: configuration.version,
                workspaceId: owner.id,
                skipToolsValidation: metadata.skipToolsValidation,
              },
              { transaction }
            );
            const messageRow = await MessageModel.create(
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

            // This will tweak the UI a bit.
            const parentAgentMessageId =
              metadata.userMessage.agenticMessageData?.type === "agent_handover"
                ? metadata.userMessage.agenticMessageData.originMessageId
                : null;

            // Track agent usage when creating a new agent message.
            void signalAgentUsage({
              agentConfigurationId: configuration.sId,
              workspaceId: owner.sId,
            });

            results.push({
              agentMessageRow,
              messageRow,
              parentAgentMessageId,
              parentMessageId: metadata.userMessage.sId,
              configuration,
            });
          },
          {
            concurrency: 10,
          }
        );
      }
      break;
    default:
      assertNever(metadata);
  }

  const agentMessages: AgentMessageType[] = results.map(
    ({
      agentMessageRow,
      messageRow,
      parentMessageId,
      parentAgentMessageId,
      configuration,
    }) => ({
      id: messageRow.id,
      agentMessageId: agentMessageRow.id,
      created: agentMessageRow.createdAt.getTime(),
      completedTs: agentMessageRow.completedAt?.getTime() ?? null,
      sId: messageRow.sId,
      type: "agent_message",
      visibility: messageRow.visibility,
      version: messageRow.version,
      parentMessageId,
      parentAgentMessageId,
      status: agentMessageRow.status,
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
      modelInteractionDurationMs: agentMessageRow.modelInteractionDurationMs,
      richMentions: [],
    })
  );

  await updateConversationRequirements(auth, {
    agents: agentMessages.map((m) => m.configuration),
    conversation,
    t: transaction,
  });

  if (metadata.type === "create") {
    if (agentMessages.length > 0) {
      await runAgentLoopWorkflow({
        auth,
        agentMessages,
        conversation,
        userMessage: metadata.userMessage,
      });
    }
  }

  return agentMessages;
};
