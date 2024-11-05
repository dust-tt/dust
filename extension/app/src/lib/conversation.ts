import type { PublicPostConversationsRequestBody } from "@dust-tt/client";
import type {
  AgentMessageNewEvent,
  AgentMessageType,
  ConversationType,
  ConversationVisibility,
  LightWorkspaceType,
  MentionType,
  Result,
  SubmitMessageError,
  UserMessageNewEvent,
  UserMessageType,
  UserMessageWithRankType,
  UserType,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import { getAccessToken, getStoredUser } from "@extension/lib/storage";

export function createPlaceholderUserMessage({
  input,
  mentions,
  user,
}: {
  input: string;
  mentions: MentionType[];
  user: UserType;
}): UserMessageType {
  const createdAt = new Date().getTime();
  const { email, fullName, image, username } = user;

  return {
    id: -1,
    content: input,
    created: createdAt,
    mentions,
    user,
    visibility: "visible",
    type: "user_message",
    sId: `placeholder-${createdAt.toString()}`,
    version: 0,
    context: {
      email,
      fullName,
      profilePictureUrl: image,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC",
      username,
      origin: "web",
    },
  };
}

// Function to update the message pages with the new message from the event.
export function getUpdatedMessagesFromEvent(
  currentConversation: { conversation: ConversationType } | undefined,
  event: AgentMessageNewEvent | UserMessageNewEvent
) {
  if (!currentConversation || !currentConversation.conversation) {
    return undefined;
  }

  // Check if the message already exists in the cache.
  const isMessageAlreadyInCache = currentConversation.conversation.content.some(
    (messages) => messages.some((message) => message.sId === event.message.sId)
  );

  // If the message is already in the cache, ignore the event.
  if (isMessageAlreadyInCache) {
    return currentConversation;
  }

  return updateConversationWithOptimisticData(
    currentConversation,
    event.message
  );
}

export function updateConversationWithOptimisticData(
  currentConversation: { conversation: ConversationType } | undefined,
  messageOrPlaceholder: UserMessageType | AgentMessageType
): { conversation: ConversationType } {
  console.log("messageOrPlaceholder", messageOrPlaceholder);
  if (
    !currentConversation?.conversation ||
    currentConversation.conversation.content.length === 0
  ) {
    throw new Error("Conversation not found");
  }

  const conversation: ConversationType = {
    ...currentConversation.conversation,
    content: [...currentConversation.conversation.content],
  };

  // To please typescript
  const message =
    messageOrPlaceholder.type === "user_message"
      ? [messageOrPlaceholder]
      : [messageOrPlaceholder];

  conversation.content.push(message);

  return { conversation };
}

export async function postConversation({
  owner,
  messageData,
  visibility = "unlisted",
  tabContent,
}: {
  owner: LightWorkspaceType;
  messageData: {
    input: string;
    mentions: MentionType[];
  };
  visibility?: ConversationVisibility;
  tabContent: {
    title: string;
    content: string;
    url: string;
  } | null;
}): Promise<Result<ConversationType, SubmitMessageError>> {
  const { input, mentions } = messageData;
  const token = await getAccessToken();
  const user = await getStoredUser();

  if (!user) {
    // This should never happen.
    return new Err({
      type: "user_not_found",
      title: "User not found.",
      message: "Please log in again.",
    });
  }

  const body: PublicPostConversationsRequestBody = {
    title: null,
    visibility,
    message: {
      content: input,
      context: {
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        profilePictureUrl: null,
        origin: "extension",
      },
      mentions,
    },
    contentFragment: tabContent
      ? {
          title: tabContent.title,
          content: tabContent.content,
          url: tabContent.url,
          contentType: "text/plain",
          context: {
            username: user.username,
            email: user.email,
            fullName: user.fullName,
            profilePictureUrl: null,
          },
        }
      : undefined,
    blocking: false, // We want streaming.
  };

  // Create new conversation and post the initial message at the same time.
  const cRes = await fetch(
    `${process.env.DUST_DOMAIN}/api/v1/w/${owner.sId}/assistant/conversations`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    }
  );

  if (!cRes.ok) {
    const data = await cRes.json();
    return new Err({
      type:
        data.error.type === "plan_message_limit_exceeded"
          ? "plan_limit_reached_error"
          : "message_send_error",
      title: "Your message could not be sent.",
      message: data.error.message || "Please try again or contact us.",
    });
  }

  const conversationData = await cRes.json();

  return new Ok(conversationData.conversation);
}

export async function postMessage({
  owner,
  conversationId,
  messageData,
}: {
  owner: LightWorkspaceType;
  conversationId: string;
  messageData: {
    input: string;
    mentions: MentionType[];
  };
}): Promise<Result<{ message: UserMessageWithRankType }, SubmitMessageError>> {
  const { input, mentions } = messageData;
  const token = await getAccessToken();
  const user = await getStoredUser();

  if (!user) {
    // This should never happen.
    return new Err({
      type: "user_not_found",
      title: "User not found.",
      message: "Please log in again.",
    });
  }

  // Create a new user message.
  const mRes = await fetch(
    `${process.env.DUST_DOMAIN}/api/v1/w/${owner.sId}/assistant/conversations/${conversationId}/messages`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        content: input,
        context: {
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          profilePictureUrl: null, // todo daph
          origin: "extension",
        },
        mentions,
      }),
    }
  );

  if (!mRes.ok) {
    if (mRes.status === 413) {
      return new Err({
        type: "content_too_large",
        title: "Your message is too long to be sent.",
        message: "Please try again with a shorter message.",
      });
    }
    const data = await mRes.json();
    return new Err({
      type:
        data.error.type === "plan_message_limit_exceeded"
          ? "plan_limit_reached_error"
          : "message_send_error",
      title: "Your message could not be sent.",
      message: data.error.message || "Please try again or contact us.",
    });
  }

  return new Ok(await mRes.json());
}
