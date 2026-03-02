import { getRelatedContentFragments } from "@app/lib/api/assistant/content_fragments";
import { getUserMessageIdFromMessageId } from "@app/lib/api/assistant/conversation/messages";
import {
  canCurrentUserAddProjectMembers,
  canUserAccessConversation,
  isUserMemberOfSpace,
} from "@app/lib/api/assistant/conversation/permissions";
import { getRichMentionsWithStatusForMessage } from "@app/lib/api/assistant/messages";
import {
  publishAgentMessagesEvents,
  publishMessageEventsOnMessagePostOrEdit,
} from "@app/lib/api/assistant/streaming/events";
import { getUserForWorkspace } from "@app/lib/api/user";
import type { Authenticator } from "@app/lib/auth";
import { extractFromString } from "@app/lib/mentions/format";
import type { MentionStatusType } from "@app/lib/models/agent/conversation";
import { MentionModel } from "@app/lib/models/agent/conversation";
import { triggerConversationUnreadNotifications } from "@app/lib/notifications/workflows/conversation-unread";
import { notifyProjectMembersAdded } from "@app/lib/notifications/workflows/project-added-as-member";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import type { UserResource } from "@app/lib/resources/user_resource";
import { auditLog } from "@app/logger/logger";
import type {
  AgentMessageType,
  AgentMessageTypeWithoutMentions,
  ConversationType,
  RichMentionWithStatus,
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
import type { UserType } from "@app/types/user";
import uniqBy from "lodash/uniqBy";
import type { Transaction } from "sequelize";
import { getConversation } from "./fetch";

export async function getMentionStatus(
  auth: Authenticator,
  data: {
    conversation: ConversationType;
    message: UserMessageTypeWithoutMentions | AgentMessageTypeWithoutMentions;
    isParticipant: boolean;
    mentionedUser: UserResource;
  }
): Promise<MentionStatusType> {
  const { conversation, message, isParticipant, mentionedUser } = data;
  // For project conversations we do not have to check if the mentioned user
  // can access the conversation. If the project is open, they can access it.
  // If it is closed, the only requested space will be the project itself by design.
  if (isProjectConversation(conversation)) {
    const isProjectMember = await isUserMemberOfSpace(auth, {
      userId: mentionedUser.sId,
      spaceId: conversation.spaceId,
    });
    if (isProjectMember) {
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
  if (isParticipant) {
    return "approved";
  }
  // In case of agent message on triggered conversation, we want to auto approve mentions only if the users are mentioned in the prompt.
  if (
    conversation.triggerId &&
    message.type === "agent_message" &&
    message.configuration.instructions
  ) {
    const isUserMentionedInInstructions = extractFromString(
      message.configuration.instructions
    )
      .filter(isUserMention)
      .some((mention) => mention.userId === mentionedUser.sId);

    if (isUserMentionedInInstructions) {
      return "approved";
    }
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

        // TODO: Alternative approach would be to always set pending_project_membership for
        // project conversations and decide at render time whether to show "add to project"
        // (for editors) or "request access" (for non-editors). This would require building
        // a request access flow. See https://github.com/dust-tt/dust/issues/20852
        const status = await getMentionStatus(auth, {
          conversation,
          message,
          isParticipant,
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
