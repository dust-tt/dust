import { Authenticator } from "@app/lib/auth";
import {
  getAgentsDataRetention,
  getConversationsDataRetention,
} from "@app/lib/data_retention";
import {
  conversationUsesAgentsWithRetention,
  conversationWithoutContentForResource,
  fetchFirstVisibleLightMessage,
  fetchLightMessageBySId,
  fetchUserMessageOriginBySId,
  getUnreadNotificationFlags,
} from "@app/lib/notifications/conversation_fetch";
import { ConversationResource } from "@app/lib/resources/conversation_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import {
  ConversationError,
  getConversationDisplayTitle,
  isCompactionMessageType,
  isLightAgentMessageType,
  isPodConversation,
  isUserMessageType,
} from "@app/types/assistant/conversation";
import { isRichUserMention } from "@app/types/assistant/mentions";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { decodeHtmlEntities } from "@app/types/shared/utils/markdown";
import { z } from "zod";

// When isNewProjectConversation is true, messageId is not required (the first
// message is resolved from conversation content). Otherwise messageId is required.
export const ConversationDetailsPayloadSchema = z.object({
  workspaceId: z.string(),
  conversationId: z.string(),
  messageId: z.string().optional(),
  isNewProjectConversation: z.boolean().optional(),
});

export type ConversationDetailsPayload = z.infer<
  typeof ConversationDetailsPayloadSchema
>;

export const ConversationDetailsSchema = z.object({
  subject: z.string(),
  author: z.string(),
  authorIsAgent: z.boolean(),
  authorUserId: z.string().optional(),
  isFromTrigger: z.boolean(),
  isFromEmailAgentConversation: z.boolean(),
  isFromSlackAgentConversation: z.boolean(),
  workspaceName: z.string(),
  mentionedUserIds: z.array(z.string()),
  hasUnreadMessages: z.boolean(),
  hasUnreadMentions: z.boolean(),
  hasConversationRetentionPolicy: z.boolean(),
  hasAgentRetentionPolicies: z.boolean(),
  newMessageContent: z.string().nullable(),
  isNewProjectConversation: z.boolean().optional(),
  projectName: z.string().optional(),
});

export type ConversationDetailsType = z.infer<typeof ConversationDetailsSchema>;

export const getConversationDetails = async ({
  payload,
  auth: providedAuth,
  subscriberId,
}: { payload: ConversationDetailsPayload } & (
  | { auth: Authenticator; subscriberId?: never }
  | { auth?: never; subscriberId: string }
)): Promise<Result<ConversationDetailsType, ConversationError>> => {
  if (!payload.isNewProjectConversation && !payload.messageId) {
    throw new Error(
      "messageId is required when isNewProjectConversation is false"
    );
  }

  // Get or create auth from the discriminated union.
  let auth: Authenticator;
  if (providedAuth) {
    auth = providedAuth;
  } else {
    // subscriberId may be empty when previewing the workflow step.
    if (!subscriberId) {
      return new Ok({
        subject: "Deleted conversation",
        author: "Deleted conversation",
        authorIsAgent: false,
        isFromTrigger: false,
        isFromEmailAgentConversation: false,
        isFromSlackAgentConversation: false,
        workspaceName: "Deleted conversation",
        mentionedUserIds: [],
        avatarUrl: undefined,
        hasUnreadMessages: false,
        hasUnreadMentions: false,
        hasConversationRetentionPolicy: false,
        hasAgentRetentionPolicies: false,
        newMessageContent: null,
        isNewProjectConversation: false,
      });
    }
    auth = await Authenticator.fromUserIdAndWorkspaceId(
      subscriberId,
      payload.workspaceId
    );
  }

  const resource = await ConversationResource.fetchById(
    auth,
    payload.conversationId
  );

  if (!resource) {
    // Check if the conversation was deleted (expected during workflow delay).
    const deletedConversation = await ConversationResource.fetchById(
      auth,
      payload.conversationId,
      { includeDeleted: true }
    );
    if (deletedConversation) {
      return new Err(new ConversationError("conversation_not_found"));
    }
    // Conversation never existed - unexpected.
    throw new Error(`Conversation not found: ${payload.conversationId}`);
  }

  const conversation = await conversationWithoutContentForResource(
    auth,
    resource
  );

  const workspaceName = auth.getNonNullableWorkspace().name;
  // Decode HTML entities in conversation title (e.g. from email subjects
  // that may contain &amp;, &lt;, etc.) so notification subjects/bodies
  // display clean text.
  const subject = decodeHtmlEntities(getConversationDisplayTitle(conversation));
  const isFromTrigger = !!conversation.triggerId;

  // Retrieve the message that triggered the notification.
  // For new project conversations, use the first visible message.
  const messageRes = !payload.isNewProjectConversation
    ? await fetchLightMessageBySId(auth, {
        resource,
        conversation,
        messageId: payload.messageId!,
      })
    : await fetchFirstVisibleLightMessage(auth, resource);

  if (messageRes.isErr()) {
    return messageRes;
  }

  const message = messageRes.value;
  if (message.visibility === "deleted") {
    // Message was deleted during workflow delay - expected.
    return new Err(new ConversationError("message_not_found"));
  }

  let author: string;
  let authorIsAgent: boolean;
  let authorUserId: string | undefined;
  let mentionedUserIds: string[] = [];
  const messageContent =
    message.type === "agent_message" || message.type === "user_message"
      ? message.content
      : "";

  const parentOrigin = isLightAgentMessageType(message)
    ? await fetchUserMessageOriginBySId(auth, {
        conversation,
        messageId: message.parentMessageId,
      })
    : null;

  const isFromEmailAgentConversation =
    (isUserMessageType(message) && message.context.origin === "email") ||
    parentOrigin === "email";

  const isFromSlackAgentConversation =
    (isUserMessageType(message) && message.context.origin === "slack") ||
    parentOrigin === "slack";

  if (isCompactionMessageType(message)) {
    // Compaction messages don't trigger notifications.
    return new Err(new ConversationError("message_not_found"));
  } else if (isUserMessageType(message)) {
    author =
      message.user?.fullName ?? message.context.fullName ?? "Someone else";
    authorUserId = message.user?.sId ?? undefined;
    authorIsAgent = false;

    // Extract approved user mentions from the rendered message.
    mentionedUserIds = message.richMentions
      .filter((m) => isRichUserMention(m) && m.status === "approved")
      .map((m) => m.id);
  } else if (isLightAgentMessageType(message)) {
    author = message.configuration.name
      ? `@${message.configuration.name}`
      : "An agent";
    authorIsAgent = true;
  } else {
    assertNever(message);
  }

  const { hasUnreadMessages, hasUnreadMentions } =
    await getUnreadNotificationFlags(auth, { resource, conversation });

  const conversationsRetention = await getConversationsDataRetention(auth);
  const hasConversationRetentionPolicy = conversationsRetention !== null;

  const agentsRetention = await getAgentsDataRetention(auth);
  const hasAgentRetentionPolicies = await conversationUsesAgentsWithRetention(
    auth,
    resource,
    agentsRetention
  );

  // Fetch project-specific details when this is a new project conversation notification.
  let projectName: string | undefined;
  const isNewProjectConversation = !!payload.isNewProjectConversation;

  if (isNewProjectConversation && isPodConversation(conversation)) {
    const project = await SpaceResource.fetchById(auth, conversation.spaceId);
    if (project) {
      projectName = project.name;
    }
  }

  return new Ok({
    subject,
    author,
    authorIsAgent,
    authorUserId,
    isFromTrigger,
    isFromEmailAgentConversation,
    isFromSlackAgentConversation,
    workspaceName,
    mentionedUserIds,
    hasUnreadMessages,
    hasUnreadMentions,
    hasConversationRetentionPolicy,
    hasAgentRetentionPolicies,
    newMessageContent: messageContent,
    isNewProjectConversation,
    projectName,
  });
};
