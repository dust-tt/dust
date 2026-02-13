import assert from "assert";
import uniq from "lodash/uniq";
import uniqBy from "lodash/uniqBy";
import type { Transaction } from "sequelize";
import { Op } from "sequelize";

import { signalAgentUsage } from "@app/lib/api/assistant/agent_usage";
import { getRelatedContentFragments } from "@app/lib/api/assistant/content_fragments";
import {
  getCompletionDuration,
  getRichMentionsWithStatusForMessage,
} from "@app/lib/api/assistant/messages";
import { getContentFragmentSpaceIds } from "@app/lib/api/assistant/permissions";
import {
  publishAgentMessagesEvents,
  publishMessageEventsOnMessagePostOrEdit,
} from "@app/lib/api/assistant/streaming/events";
import { getUserForWorkspace } from "@app/lib/api/user";
import { Authenticator } from "@app/lib/auth";
import { extractFromString } from "@app/lib/mentions/format";
import type { MentionStatusType } from "@app/lib/models/agent/conversation";
import {
  AgentMessageModel,
  MentionModel,
  MessageModel,
  UserMessageModel,
} from "@app/lib/models/agent/conversation";
import { triggerConversationUnreadNotifications } from "@app/lib/notifications/workflows/conversation-unread";
import { notifyProjectMembersAdded } from "@app/lib/notifications/workflows/project-added-as-member";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { GroupSpaceMemberResource } from "@app/lib/resources/group_space_member_resource";
import { MembershipResource } from "@app/lib/resources/membership_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  generateRandomModelSId,
  getResourceIdFromSId,
} from "@app/lib/resources/string_ids";
import { UserResource } from "@app/lib/resources/user_resource";
import { isEmailValid } from "@app/lib/utils";
import { concurrentExecutor } from "@app/lib/utils/async_utils";
import logger, { auditLog } from "@app/logger/logger";
import type { ContentFragmentInputWithContentNode } from "@app/types/api/internal/assistant";
import type { LightAgentConfigurationType } from "@app/types/assistant/agent";
import type {
  AgenticMessageData,
  AgentMessageType,
  AgentMessageTypeWithoutMentions,
  ConversationType,
  ConversationWithoutContentType,
  MessageVisibility,
  RichMentionWithStatus,
  UserMessageContext,
  UserMessageType,
  UserMessageTypeWithoutMentions,
} from "@app/types/assistant/conversation";
import {
  isAgentMessageType,
  isProjectConversation,
  isUserMessageType,
} from "@app/types/assistant/conversation";
import type { MentionType } from "@app/types/assistant/mentions";
import {
  isAgentMention,
  isRichUserMention,
  isUserMention,
  toMentionType,
} from "@app/types/assistant/mentions";
import { isContentFragmentType } from "@app/types/content_fragment";
import type { APIErrorWithStatusCode } from "@app/types/error";
import type { ModelId } from "@app/types/shared/model_id";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { removeNulls } from "@app/types/shared/utils/general";
import type { UserType, WorkspaceType } from "@app/types/user";

import { getConversation } from "./fetch";

/**
 * Check if a user can access a conversation based on space permissions.
 * Returns true if the user has read access to all required spaces.
 */
async function canUserAccessConversation(
  auth: Authenticator,
  {
    userId,
    conversationId,
  }: {
    userId: string;
    conversationId: string;
  }
): Promise<boolean> {
  const workspace = auth.getNonNullableWorkspace();
  const fakeAuth = await Authenticator.fromUserIdAndWorkspaceId(
    userId,
    workspace.sId
  );

  const canAccess = await ConversationResource.canAccess(
    fakeAuth,
    conversationId
  );

  return canAccess === "allowed";
}

/**
 * Check if a user is a member of a space (project).
 */
async function isUserMemberOfSpace(
  auth: Authenticator,
  {
    userId,
    spaceId,
  }: {
    userId: string;
    spaceId: string;
  }
): Promise<boolean> {
  const space = await SpaceResource.fetchById(auth, spaceId);
  if (!space) {
    return false;
  }

  const userAuth = await Authenticator.fromUserIdAndWorkspaceId(
    userId,
    auth.getNonNullableWorkspace().sId
  );

  if (!userAuth) {
    return false;
  }

  return space.isMember(userAuth);
}

/**
 * Check if the current user can add members to a project space.
 */
async function canCurrentUserAddProjectMembers(
  auth: Authenticator,
  spaceId: string,
  mentionedUserId: string
): Promise<boolean> {
  const space = await SpaceResource.fetchById(auth, spaceId);
  if (!space) {
    return false;
  }
  const groupSpaceMembers = await GroupSpaceMemberResource.fetchBySpace({
    space,
    filterOnManagementMode: true,
  });

  assert(
    groupSpaceMembers.length === 1,
    "Projects are expected to have exactly one group space member"
  );

  return groupSpaceMembers[0].canAddMember(auth, mentionedUserId);
}

export async function getMentionStatus(
  auth: Authenticator,
  data: {
    conversation: ConversationType;
    autoApprove: boolean;
    mentionedUser: UserResource;
  }
): Promise<MentionStatusType> {
  const { conversation, autoApprove, mentionedUser } = data;
  // For project conversations we do not have to check if the mentioned user
  // can access the conversation. If the project is open, they can access it.
  // If it is closed, the only requested space will be the project itself by design.
  if (isProjectConversation(conversation)) {
    if (autoApprove) {
      return "approved";
    }
    const canAddMember = await canCurrentUserAddProjectMembers(
      auth,
      conversation.spaceId,
      mentionedUser.sId
    );
    if (canAddMember) {
      return "pending_project_membership";
    }
    return "user_restricted_by_conversation_access";
  }

  const canAccess = await canUserAccessConversation(auth, {
    userId: mentionedUser.sId,
    conversationId: conversation.sId,
  });
  if (!canAccess) {
    return "user_restricted_by_conversation_access";
  }
  if (autoApprove) {
    return "approved";
  }
  return "pending_conversation_access";
}

export const createUserMentions = async (
  auth: Authenticator,
  {
    mentions,
    message,
    conversation,
    transaction,
  }: {
    mentions: MentionType[];
    message: AgentMessageTypeWithoutMentions | UserMessageTypeWithoutMentions;
    conversation: ConversationType;
    transaction?: Transaction;
  }
): Promise<RichMentionWithStatus[]> => {
  const usersById = new Map<ModelId, UserType>();

  // Deduplicate mentions before processing
  const uniqueMentions = uniqBy(
    mentions.filter(isUserMention),
    (mention) => mention.userId
  );

  // Store user mentions in the database
  const mentionModels = await Promise.all(
    uniqueMentions.map(async (mention) => {
      // check if the user exists in the workspace before creating the mention
      const user = await getUserForWorkspace(auth, {
        userId: mention.userId,
      });
      if (user) {
        usersById.set(user.id, user.toJSON());

        const isParticipant =
          await ConversationResource.isConversationParticipant(auth, {
            conversation,
            user: user.toJSON(),
          });

        // Always auto approve mentions for existing participants.
        let autoApprove = isParticipant;
        // In case of agent message on triggered conversation, we want to auto approve mentions only if the users are mentioned in the prompt.
        if (
          !autoApprove &&
          conversation.triggerId &&
          message.type === "agent_message" &&
          message.configuration.instructions
        ) {
          const isUserMentionedInInstructions = extractFromString(
            message.configuration.instructions
          )
            .filter(isUserMention)
            .some((mention) => mention.userId === user.sId);

          if (isUserMentionedInInstructions) {
            autoApprove = true;
          }
        }

        // Auto approve mentions for users who are members of the conversation's project space.
        if (!autoApprove && isProjectConversation(conversation)) {
          autoApprove = await isUserMemberOfSpace(auth, {
            userId: user.sId,
            spaceId: conversation.spaceId,
          });
        }

        // TODO: Alternative approach would be to always set pending_project_membership for
        // project conversations and decide at render time whether to show "add to project"
        // (for editors) or "request access" (for non-editors). This would require building
        // a request access flow. See https://github.com/dust-tt/dust/issues/20852
        const status = await getMentionStatus(auth, {
          conversation,
          autoApprove,
          mentionedUser: user,
        });

        const mentionModel = await MentionModel.create(
          {
            messageId: message.id,
            userId: user.id,
            workspaceId: auth.getNonNullableWorkspace().id,
            status,
          },
          { transaction }
        );

        if (!isParticipant && status === "approved") {
          await ConversationResource.upsertParticipation(auth, {
            conversation,
            action: "subscribed",
            user: user.toJSON(),
            lastReadAt: null,
            transaction,
          });
        }
        return mentionModel;
      }
    })
  );

  return getRichMentionsWithStatusForMessage(
    message.id,
    removeNulls(mentionModels),
    usersById,
    new Map() // No agent configurations in the users mentions.
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

export async function canAgentBeUsedInProjectConversation(
  auth: Authenticator,
  {
    configuration,
    conversation,
  }: {
    configuration: LightAgentConfigurationType;
    conversation: ConversationWithoutContentType;
  }
): Promise<boolean> {
  if (!isProjectConversation(conversation)) {
    throw new Error("Unexpected: conversation is not a project conversation");
  }
  // In case of Project's conversation, we need to check if the agent configuration is using only the project spaces or open spaces, otherwise we reject the mention and do not create the agent message.
  // Check to skip heavy work if the agent configuration is only using the project space.
  if (
    configuration.requestedSpaceIds.some(
      (spaceId) => spaceId !== conversation.spaceId
    )
  ) {
    // Need to load all the spaces to check if they are restricted.
    const spaces = await SpaceResource.fetchByIds(
      auth,
      configuration.requestedSpaceIds.filter(
        (spaceId) => spaceId !== conversation.spaceId
      )
    );
    if (spaces.some((space) => !space.isOpen())) {
      return false;
    }
  }

  return true;
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
  // !!! IMPORTANT !!!
  // By design, project conversations are always visible to everyone that have READ permission to the project.
  // Therefor we strip all the space requirements from the conversation.
  // It means that we rely on agents and content fragments permissions checking to have happened before.
  // It also means that if we "move" a conversation to a project, we need to update the conversation requirements and we make it visibel
  if (isProjectConversation(conversation)) {
    const spaceModelId = getResourceIdFromSId(conversation.spaceId);
    if (spaceModelId === null) {
      throw new Error("Unexpected: invalid space sId in conversation.");
    }
    if (
      conversation.requestedSpaceIds.length !== 1 ||
      conversation.requestedSpaceIds[0] !== conversation.spaceId
    ) {
      await ConversationResource.updateRequirements(
        auth,
        conversation.sId,
        [spaceModelId],
        t
      );
    }
    return;
  }

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
    transaction,
  }: {
    conversation: ConversationWithoutContentType;
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
        attributes: ["userId"],
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
  };
}

export async function validateUserMention(
  auth: Authenticator,
  {
    conversationId,
    userId,
    messageId,
    approvalState,
  }: {
    conversationId: string;
    userId: string;
    messageId: string;
    approvalState: "approved" | "rejected";
  }
): Promise<Result<void, APIErrorWithStatusCode>> {
  const conversationRes = await getConversation(auth, conversationId);
  if (conversationRes.isErr()) {
    return new Err({
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found",
      },
    });
  }

  const conversation = conversationRes.value;
  const isApproval = approvalState === "approved";

  // For project conversations, add user to project space first when approving.
  if (isProjectConversation(conversation) && isApproval) {
    const space = await SpaceResource.fetchById(auth, conversation.spaceId);
    if (!space) {
      return new Err({
        status_code: 404,
        api_error: {
          type: "space_not_found",
          message: "Project space not found",
        },
      });
    }

    const currentUser = auth.user();
    if (!currentUser) {
      return new Err({
        status_code: 401,
        api_error: {
          type: "not_authenticated",
          message: "User not authenticated",
        },
      });
    }

    const addResult = await space.addMembers(auth, { userIds: [userId] });
    if (addResult.isErr()) {
      const error = addResult.error;
      return new Err({
        status_code: error.code === "unauthorized" ? 403 : 400,
        api_error: {
          type: "invalid_request_error",
          message: error.message,
        },
      });
    }

    // Notify the user they were added to the project.
    notifyProjectMembersAdded(auth, {
      project: space.toJSON(),
      addedUserIds: [userId],
    });
  }

  const mentionStatus: "approved" | "rejected" = approvalState;

  // Verify the message exists
  const message = conversation.content.flat().find((m) => m.sId === messageId);

  if (!message) {
    return new Err({
      status_code: 404,
      api_error: {
        type: "message_not_found",
        message: "Message not found",
      },
    });
  }
  if (isApproval) {
    const auditMessage = conversation.spaceId
      ? "User approved a mention and added user to project"
      : "User approved a mention";
    auditLog(
      {
        author: auth.getNonNullableUser().toJSON(),
        workspaceId: conversation.owner.sId,
        conversationId: conversation.sId,
        messageId: message.sId,
        userId,
        approvalState,
      },
      auditMessage
    );
  }

  if (isUserMessageType(message)) {
    // Verify user is authorized to edit the message by checking the message user.
    if (message.user && message.user.id !== auth.getNonNullableUser().id) {
      return new Err({
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: "User is not authorized to edit this mention",
        },
      });
    }
  } else if (isAgentMessageType(message)) {
    // Verify user is authorized to edit the message by going back to the user message.
    const { userMessageUserId } = await getUserMessageIdFromMessageId(auth, {
      messageId,
    });
    if (
      userMessageUserId !== null &&
      userMessageUserId !== auth.getNonNullableUser().id
    ) {
      return new Err({
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: "User is not authorized to edit this mention",
        },
      });
    }
  } else if (isContentFragmentType(message)) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid message type",
      },
    });
  } else {
    assertNever(message);
  }
  const user = await getUserForWorkspace(auth, {
    userId,
  });
  if (!user) {
    return new Err({
      status_code: 404,
      api_error: {
        type: "user_not_found",
        message: "User not found",
      },
    });
  }

  const updatedMessages: {
    userMessages: UserMessageType[];
    agentMessages: AgentMessageType[];
  } = {
    userMessages: [],
    agentMessages: [],
  };
  const isPendingStatus = (status: MentionStatusType): boolean =>
    status === "pending_conversation_access" ||
    status === "pending_project_membership";

  // Find all pending mentions for the same user on conversation messages latest versions.
  for (const messageVersions of conversation.content) {
    const latestMessage = messageVersions[messageVersions.length - 1];

    if (
      latestMessage.visibility !== "deleted" &&
      !isContentFragmentType(latestMessage) &&
      latestMessage.richMentions.some(
        (m) => isPendingStatus(m.status) && m.id === userId
      )
    ) {
      const mentionModel = await MentionModel.findOne({
        where: {
          workspaceId: conversation.owner.id,
          messageId: latestMessage.id,
          userId: user.id,
        },
      });
      if (!mentionModel) {
        continue;
      }
      await mentionModel.update({ status: mentionStatus });
      const newRichMentions = latestMessage.richMentions.map((m) =>
        isRichUserMention(m) && m.id === userId
          ? {
              ...m,
              status: mentionStatus,
            }
          : m
      );
      if (isUserMessageType(latestMessage)) {
        updatedMessages.userMessages.push({
          ...latestMessage,
          richMentions: newRichMentions,
          mentions: newRichMentions.map(toMentionType),
        });
      } else if (isAgentMessageType(latestMessage)) {
        updatedMessages.agentMessages.push({
          ...latestMessage,
          richMentions: newRichMentions,
        });
      }
    }
  }

  for (const userMessage of updatedMessages.userMessages) {
    await publishMessageEventsOnMessagePostOrEdit(
      conversation,
      {
        ...userMessage,
        contentFragments: getRelatedContentFragments(conversation, userMessage),
      },
      []
    );
  }

  if (updatedMessages.agentMessages.length > 0) {
    await publishAgentMessagesEvents(
      conversation,
      updatedMessages.agentMessages
    );
  }

  const isParticipant = await ConversationResource.isConversationParticipant(
    auth,
    {
      conversation,
      user: user.toJSON(),
    }
  );

  if (!isParticipant && isApproval) {
    const status = await ConversationResource.upsertParticipation(auth, {
      conversation,
      action: "subscribed",
      user: user.toJSON(),
      lastReadAt: null,
    });

    if (status === "added") {
      await triggerConversationUnreadNotifications(auth, {
        conversationId: conversation.sId,
        messageId,
        userToNotifyId: user.sId,
      });
    }
  }

  return new Ok(undefined);
}

export async function dismissMention(
  auth: Authenticator,
  {
    messageId,
    conversationId,
    type,
    id,
  }: {
    messageId: string;
    conversationId: string;
    type: "user" | "agent";
    id: string;
  }
): Promise<Result<void, APIErrorWithStatusCode>> {
  const conversationRes = await getConversation(auth, conversationId);
  if (conversationRes.isErr()) {
    return new Err({
      status_code: 404,
      api_error: {
        type: "conversation_not_found",
        message: "Conversation not found",
      },
    });
  }

  const conversation = conversationRes.value;

  // Verify the message exists
  const message = conversation.content.flat().find((m) => m.sId === messageId);

  if (!message) {
    return new Err({
      status_code: 404,
      api_error: {
        type: "message_not_found",
        message: "Message not found",
      },
    });
  }

  if (isUserMessageType(message)) {
    // Verify user is authorized to edit the message by checking the message user.
    if (message.user && message.user.id !== auth.getNonNullableUser().id) {
      return new Err({
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: "User is not authorized to dismiss this mention",
        },
      });
    }
  } else if (isAgentMessageType(message)) {
    // Verify user is authorized to edit the message by going back to the user message.
    const { userMessageUserId } = await getUserMessageIdFromMessageId(auth, {
      messageId,
    });
    if (
      userMessageUserId !== null &&
      userMessageUserId !== auth.getNonNullableUser().id
    ) {
      return new Err({
        status_code: 403,
        api_error: {
          type: "invalid_request_error",
          message: "User is not authorized to dismiss this mention",
        },
      });
    }
  } else if (isContentFragmentType(message)) {
    return new Err({
      status_code: 400,
      api_error: {
        type: "invalid_request_error",
        message: "Invalid message type",
      },
    });
  } else {
    assertNever(message);
  }

  const updatedMessages: {
    userMessages: UserMessageType[];
    agentMessages: AgentMessageType[];
  } = {
    userMessages: [],
    agentMessages: [],
  };

  // For user mentions, convert sId to database ID
  let userIdForQuery: number | undefined;
  if (type === "user") {
    const user = await getUserForWorkspace(auth, {
      userId: id,
    });
    if (!user) {
      return new Err({
        status_code: 404,
        api_error: {
          type: "user_not_found",
          message: "User not found",
        },
      });
    }
    userIdForQuery = user.id;
  }

  const predicate = (m: RichMentionWithStatus) =>
    (m.status === "agent_restricted_by_space_usage" ||
      m.status === "user_restricted_by_conversation_access") &&
    m.type === type &&
    m.id === id;

  // Find all restricted mentions for the same user/agent on conversation messages latest versions.
  for (const messageVersions of conversation.content) {
    const latestMessage = messageVersions[messageVersions.length - 1];

    if (
      latestMessage.visibility !== "deleted" &&
      !isContentFragmentType(latestMessage) &&
      latestMessage.richMentions.some(predicate)
    ) {
      const mentionModel = await MentionModel.findOne({
        where: {
          workspaceId: conversation.owner.id,
          messageId: latestMessage.id,
          ...(type === "user"
            ? { userId: userIdForQuery }
            : { agentConfigurationId: id }),
        },
      });
      if (!mentionModel) {
        continue;
      }
      await mentionModel.update({ dismissed: true });
      const newRichMentions = latestMessage.richMentions.map((m) =>
        predicate(m)
          ? {
              ...m,
              dismissed: true,
            }
          : m
      );
      if (isUserMessageType(latestMessage)) {
        updatedMessages.userMessages.push({
          ...latestMessage,
          richMentions: newRichMentions,
          mentions: newRichMentions.map(toMentionType),
        });
      } else if (isAgentMessageType(latestMessage)) {
        updatedMessages.agentMessages.push({
          ...latestMessage,
          richMentions: newRichMentions,
        });
      }
    }
  }

  for (const userMessage of updatedMessages.userMessages) {
    await publishMessageEventsOnMessagePostOrEdit(
      conversation,
      {
        ...userMessage,
        contentFragments: getRelatedContentFragments(conversation, userMessage),
      },
      []
    );
  }

  if (updatedMessages.agentMessages.length > 0) {
    await publishAgentMessagesEvents(
      conversation,
      updatedMessages.agentMessages
    );
  }

  return new Ok(undefined);
}
