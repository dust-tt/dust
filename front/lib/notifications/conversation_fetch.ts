import { batchRenderMessages } from "@app/lib/api/assistant/messages";
import type { Authenticator } from "@app/lib/auth";
import {
  AgentMessageModel,
  MessageModel,
} from "@app/lib/models/agent/conversation";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { MentionResource } from "@app/lib/resources/mention_resource";
import type {
  ConversationWithoutContentType,
  LightConversationType,
  LightMessageType,
  UserMessageOrigin,
} from "@app/types/assistant/conversation";
import {
  ConversationError,
  isVisibleMessage,
} from "@app/types/assistant/conversation";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { Op } from "sequelize";

const FIRST_VISIBLE_MESSAGE_RANK_LIMIT = 50;

function keepLatestLightMessagePerRank(
  messages: LightMessageType[]
): LightMessageType[] {
  const byRank = new Map<number, LightMessageType>();
  for (const message of messages) {
    const existing = byRank.get(message.rank);
    if (!existing || message.version >= existing.version) {
      byRank.set(message.rank, message);
    }
  }

  return [...byRank.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, message]) => message);
}

async function renderLightMessages(
  auth: Authenticator,
  resource: ConversationResource,
  messages: Awaited<ReturnType<ConversationResource["fetchMessagesByModelIds"]>>
): Promise<Result<LightMessageType[], ConversationError>> {
  if (messages.length === 0) {
    return new Ok([]);
  }

  const renderRes = await batchRenderMessages(
    auth,
    resource,
    messages,
    "light"
  );
  if (renderRes.isErr()) {
    return renderRes;
  }

  return new Ok(keepLatestLightMessagePerRank(renderRes.value));
}

export async function conversationWithoutContentForResource(
  auth: Authenticator,
  resource: ConversationResource
): Promise<ConversationWithoutContentType> {
  const { actionRequired, lastReadAt } =
    await ConversationResource.getActionRequiredAndLastReadAtForUser(
      auth,
      resource.id
    );

  return {
    ...resource.toJSON(),
    actionRequired,
    lastReadMs: lastReadAt?.getTime() ?? null,
    unread: lastReadAt === null || resource.updatedAt > lastReadAt,
  };
}

export async function fetchLightMessageBySId(
  auth: Authenticator,
  {
    resource,
    conversation,
    messageId,
  }: {
    resource: ConversationResource;
    conversation: ConversationWithoutContentType;
    messageId: string;
  }
): Promise<Result<LightMessageType, ConversationError>> {
  const messageRes = await ConversationResource.getMessageByIdInConversation(
    auth,
    conversation,
    messageId
  );
  if (messageRes.isErr()) {
    return new Err(new ConversationError("message_not_found"));
  }

  const message = messageRes.value;

  const withIncludes = await resource.fetchMessagesByModelIds(auth, [
    message.id,
  ]);
  const renderedRes = await renderLightMessages(auth, resource, withIncludes);
  if (renderedRes.isErr()) {
    return renderedRes;
  }

  const rendered = renderedRes.value[0];
  if (!rendered) {
    return new Err(new ConversationError("message_not_found"));
  }

  return new Ok(rendered);
}

export async function fetchFirstVisibleLightMessage(
  auth: Authenticator,
  resource: ConversationResource
): Promise<Result<LightMessageType, ConversationError>> {
  const messageIds = await resource.fetchEarliestLatestVersionMessageIds(auth, {
    limit: FIRST_VISIBLE_MESSAGE_RANK_LIMIT,
  });
  const messages = await resource.fetchMessagesByModelIds(auth, messageIds);
  const renderedRes = await renderLightMessages(auth, resource, messages);
  if (renderedRes.isErr()) {
    return renderedRes;
  }

  const firstVisible = renderedRes.value.find(isVisibleMessage);
  if (!firstVisible) {
    return new Err(new ConversationError("message_not_found"));
  }

  return new Ok(firstVisible);
}

export async function fetchUserMessageOriginBySId(
  auth: Authenticator,
  {
    conversation,
    messageId,
  }: {
    conversation: ConversationWithoutContentType;
    messageId: string;
  }
): Promise<UserMessageOrigin | null> {
  const messageRes = await ConversationResource.getMessageByIdInConversation(
    auth,
    conversation,
    messageId
  );
  if (messageRes.isErr()) {
    return null;
  }

  return messageRes.value.userMessage?.userContextOrigin ?? null;
}

export async function getUnreadNotificationFlags(
  auth: Authenticator,
  {
    resource,
    conversation,
  }: {
    resource: ConversationResource;
    conversation: ConversationWithoutContentType;
  }
): Promise<{
  hasUnreadMessages: boolean;
  hasUnreadMentions: boolean;
}> {
  const lastReadAt =
    conversation.lastReadMs !== null ? new Date(conversation.lastReadMs) : null;
  const unreadMessageIds = await resource.fetchUnreadMessageIds(
    auth,
    lastReadAt
  );

  if (unreadMessageIds.length === 0) {
    return { hasUnreadMessages: false, hasUnreadMentions: false };
  }

  const user = auth.user();
  if (!user) {
    return { hasUnreadMessages: true, hasUnreadMentions: false };
  }

  const unreadMention = await MentionResource.findByMessagesAndUser(auth, {
    messageModelIds: unreadMessageIds,
    userModelId: user.id,
    status: "approved",
  });

  return {
    hasUnreadMessages: true,
    hasUnreadMentions: unreadMention !== null,
  };
}

export async function conversationUsesAgentsWithRetention(
  auth: Authenticator,
  resource: ConversationResource,
  agentsRetention: Record<string, unknown>
): Promise<boolean> {
  const retentionAgentIds = new Set(Object.keys(agentsRetention));
  if (retentionAgentIds.size === 0) {
    return false;
  }

  const { agentConfigurationIds } =
    await resource.fetchAgentConfigurationAndContentFragmentIds(auth);

  return agentConfigurationIds.some((id) => retentionAgentIds.has(id));
}

export async function hasUnreadSucceededAgentReply(
  auth: Authenticator,
  conversationId: string
): Promise<boolean> {
  const resource = await ConversationResource.fetchById(auth, conversationId);
  if (!resource) {
    return false;
  }

  const conversation = await conversationWithoutContentForResource(
    auth,
    resource
  );
  const lastReadAt =
    conversation.lastReadMs !== null ? new Date(conversation.lastReadMs) : null;
  const unreadMessageIds = await resource.fetchUnreadMessageIds(
    auth,
    lastReadAt
  );
  if (unreadMessageIds.length === 0) {
    return false;
  }

  const workspaceId = auth.getNonNullableWorkspace().id;
  const message = await MessageModel.findOne({
    attributes: ["id"],
    where: {
      workspaceId,
      conversationId: conversation.id,
      id: { [Op.in]: unreadMessageIds },
    },
    include: [
      {
        model: AgentMessageModel,
        as: "agentMessage",
        required: true,
        attributes: [],
        where: {
          workspaceId,
          conversationId: conversation.id,
          status: "succeeded",
        },
      },
    ],
  });

  return message !== null;
}

export async function fetchUnreadLightConversation(
  auth: Authenticator,
  conversationId: string
): Promise<Result<LightConversationType, ConversationError>> {
  const resource = await ConversationResource.fetchById(auth, conversationId);
  if (!resource) {
    return new Err(new ConversationError("conversation_not_found"));
  }

  const conversation = await conversationWithoutContentForResource(
    auth,
    resource
  );
  const lastReadAt =
    conversation.lastReadMs !== null ? new Date(conversation.lastReadMs) : null;
  const unreadMessageIds = await resource.fetchUnreadMessageIds(
    auth,
    lastReadAt
  );
  const messages = await resource.fetchMessagesByModelIds(
    auth,
    unreadMessageIds
  );
  const renderedRes = await renderLightMessages(auth, resource, messages);
  if (renderedRes.isErr()) {
    return renderedRes;
  }

  return new Ok({
    ...conversation,
    owner: auth.getNonNullableWorkspace(),
    visibility: resource.visibility,
    content: renderedRes.value,
  });
}
