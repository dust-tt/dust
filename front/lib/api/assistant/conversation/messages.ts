import { signalAgentUsage } from "@app/lib/api/assistant/agent_usage";
import {
  canAgentBeUsedInProjectConversation,
  updateConversationRequirements,
} from "@app/lib/api/assistant/conversation/permissions";
import { getCompletionDuration } from "@app/lib/api/assistant/messages";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  MentionModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import {
  generateRandomModelSId,
  getResourceIdFromSId,
} from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";
import { isEmailValid } from "@app/lib/utils";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger from "@app/logger/logger";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type {
  AgenticMessageData,
  AgentMessageType,
  ConversationType,
  MessageVisibility,
  RichMentionWithStatus,
  UserMessageContext,
  UserMessageOrigin,
  UserMessageType,
  UserMessageTypeWithoutMentions,
} from "@app/types/assistant/conversation";
import { isProjectConversation } from "@app/types/assistant/conversation";
import type { MentionType } from "@app/types/assistant/mentions";
import { isAgentMention } from "@app/types/assistant/mentions";
import type { ModelId } from "@app/types/shared/model_id";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { removeNulls } from "@app/types/shared/utils/general";
import type { UserType, WorkspaceType } from "@app/types/user";
import assert from "assert";
import uniqBy from "lodash/uniqBy";
import type { Transaction } from "sequelize";
import { Op } from "sequelize";

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

export async function createUserMessage(
  auth: Authenticator,
  {
    conversation,
    metadata,
    content,
    transaction,
  }: {
    conversation: ConversationType;
    content: string;
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
): Promise<UserMessageTypeWithoutMentions> {
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
      userContextApiKeyId: context.apiKeyId ?? null,
      userContextAuthMethod: context.authMethod ?? null,
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
      branchId: conversation.branchId
        ? getResourceIdFromSId(conversation.branchId)
        : null,
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

  const createdUserMessage: UserMessageTypeWithoutMentions = {
    id: m.id,
    created: m.createdAt.getTime(),
    sId: m.sId,
    type: "user_message",
    visibility: m.visibility,
    version: m.version,
    user,
    content,
    context,
    agenticMessageData: agenticMessageData ?? undefined,
    rank: m.rank,
    reactions: [],
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
    conversation: ConversationType;
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
          userMessage: UserMessageTypeWithoutMentions;
        };
    transaction?: Transaction;
  }
): Promise<{
  agentMessages: AgentMessageType[];
  richMentions: RichMentionWithStatus[];
}> => {
  const owner = auth.getNonNullableWorkspace();
  const results: {
    agentAnswer: {
      agentMessageRow: AgentMessageModel;
      messageRow: MessageModel;
    } | null;
    configuration: LightAgentConfigurationType;
    parentMessageId: string;
    parentAgentMessageId: string | null;
    mentionRow: MentionModel | null;
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
            branchId: conversation.branchId
              ? getResourceIdFromSId(conversation.branchId)
              : null,
            parentId: metadata.parentId,
            version: metadata.agentMessage.version + 1,
            agentMessageId: agentMessageRow.id,
            workspaceId: owner.id,
          },
          {
            transaction,
          }
        );

        // Track agent usage when retrying an agent message.
        void signalAgentUsage({
          agentConfigurationId: agentConfiguration.sId,
          workspaceId: owner.sId,
        });

        results.push({
          agentAnswer: {
            agentMessageRow,
            messageRow,
          },
          parentMessageId: metadata.agentMessage.parentMessageId,
          parentAgentMessageId: metadata.agentMessage.parentAgentMessageId,
          configuration: metadata.agentMessage.configuration,
          mentionRow: null,
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
            branchId: conversation.branchId
              ? getResourceIdFromSId(conversation.branchId)
              : null,
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
          agentAnswer: {
            agentMessageRow,
            messageRow,
          },
          parentMessageId: metadata.agentMessage.parentMessageId,
          parentAgentMessageId: metadata.agentMessage.parentAgentMessageId,
          configuration: metadata.agentMessage.configuration,
          mentionRow: null,
        });
      }
      break;

    case "create":
      {
        // Deduplicate agent mentions before processing
        const uniqueAgentMentions = uniqBy(
          metadata.mentions.filter(isAgentMention),
          (mention) => mention.configurationId
        );

        await concurrentExecutor(
          uniqueAgentMentions,
          async (mention) => {
            const configuration = metadata.agentConfigurations.find(
              (ac) => ac.sId === mention.configurationId
            );
            if (!configuration) {
              return;
            }

            // In case of Project's conversation, we need to check if the agent configuration is using only the project spaces or public spaces/
            // Otherwise we reject the mention and do not create the agent message.
            if (isProjectConversation(conversation)) {
              const canAgentBeUsed = await canAgentBeUsedInProjectConversation(
                auth,
                {
                  configuration,
                  conversation,
                }
              );

              if (!canAgentBeUsed) {
                // This create the mentions from the original user message.
                // Not to be mixed with the mentions from the agent message (which will be filled later).
                const mentionRow = await MentionModel.create(
                  {
                    messageId: metadata.userMessage.id,
                    agentConfigurationId: configuration.sId,
                    workspaceId: owner.id,
                    status: "agent_restricted_by_space_usage",
                  },
                  { transaction }
                );

                results.push({
                  mentionRow,
                  agentAnswer: null,
                  parentMessageId: metadata.userMessage.sId,
                  parentAgentMessageId: null,
                  configuration,
                });

                return;
              }
            }

            // This create the mentions from the original user message.
            // Not to be mixed with the mentions from the agent message (which will be filled later).
            const mentionRow = await MentionModel.create(
              {
                messageId: metadata.userMessage.id,
                agentConfigurationId: configuration.sId,
                workspaceId: owner.id,
                status: "approved",
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
                branchId: conversation.branchId
                  ? getResourceIdFromSId(conversation.branchId)
                  : null,
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
              agentAnswer: {
                agentMessageRow,
                messageRow,
              },
              parentAgentMessageId,
              parentMessageId: metadata.userMessage.sId,
              configuration,
              mentionRow,
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

  const agentMessages: AgentMessageType[] = removeNulls(
    results.map(
      ({
        agentAnswer,
        parentMessageId,
        parentAgentMessageId,
        configuration,
      }) => {
        if (agentAnswer) {
          const { agentMessageRow, messageRow } = agentAnswer;
          return {
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
            modelInteractionDurationMs:
              agentMessageRow.modelInteractionDurationMs,
            completionDurationMs: getCompletionDuration(
              agentMessageRow.createdAt.getTime(),
              agentMessageRow.completedAt?.getTime() ?? null,
              []
            ),
            richMentions: [],
            reactions: [],
          };
        }
      }
    )
  );

  const richMentions: RichMentionWithStatus[] = removeNulls(
    results.map(({ mentionRow, configuration }) => {
      if (mentionRow) {
        return {
          type: "agent",
          id: configuration.sId,
          label: configuration.name,
          status: mentionRow.status,
          pictureUrl: configuration.pictureUrl,
          description: configuration.description,
          dismissed: mentionRow.dismissed ?? false,
        };
      }
    })
  );

  await updateConversationRequirements(auth, {
    agents: agentMessages.map((m) => m.configuration),
    conversation,
    t: transaction,
  });

  return { agentMessages, richMentions };
};

export async function getUserMessageIdFromMessageId(
  auth: Authenticator,
  { messageId }: { messageId: string }
): Promise<{
  agentMessageId: string;
  agentMessageVersion: number;
  userMessageId: string;
  userMessageVersion: number;
  userMessageUserId: number | null;
  userMessageOrigin: UserMessageOrigin;
}> {
  // Query 1: Get the message and its parentId.
  const agentMessage = await MessageModel.findOne({
    where: {
      workspaceId: auth.getNonNullableWorkspace().id,
      sId: messageId,
      agentMessageId: { [Op.ne]: null },
    },
    attributes: ["parentId", "version", "sId"],
  });

  assert(
    agentMessage?.parentId,
    "Agent message is expected to have a parentId"
  );

  // Query 2: Get the parent message's sId (which is the user message).
  const parentMessage = await MessageModel.findOne({
    where: {
      id: agentMessage.parentId,
      workspaceId: auth.getNonNullableWorkspace().id,
    },
    attributes: ["sId", "version"],
    include: [
      {
        model: UserMessageModel,
        as: "userMessage",
        required: true,
        attributes: ["userId", "userContextOrigin"],
      },
    ],
  });

  assert(
    parentMessage && parentMessage.userMessage,
    "A user message is expected for the agent message's parent"
  );

  return {
    agentMessageId: agentMessage.sId,
    agentMessageVersion: agentMessage.version,
    userMessageId: parentMessage.sId,
    userMessageVersion: parentMessage.version,
    userMessageUserId: parentMessage.userMessage.userId,
    userMessageOrigin: parentMessage.userMessage.userContextOrigin,
  };
}
