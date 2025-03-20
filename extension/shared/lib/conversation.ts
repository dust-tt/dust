import type { ContentFragmentsType } from "@app/shared/lib/types";
import type { PlatformService } from "@app/shared/services/platform";
import type {
  AgentMentionType,
  AgentMessageNewEvent,
  AgentMessagePublicType,
  ContentFragmentType,
  ConversationPublicType,
  ConversationVisibility,
  DustAPI,
  LightWorkspaceType,
  Result,
  UserMessageNewEvent,
  UserMessageType,
  UserMessageWithRankType,
  UserType,
} from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";

type SubmitMessageError = {
  type:
    | "user_not_found"
    | "attachment_upload_error"
    | "message_send_error"
    | "plan_limit_reached_error"
    | "content_too_large";
  title: string;
  message: string;
};

export type MessageWithContentFragmentsType =
  | AgentMessagePublicType
  | (UserMessageType & {
      contenFragments?: ContentFragmentType[];
    });

export function createPlaceholderUserMessage({
  input,
  mentions,
  user,
}: {
  input: string;
  mentions: AgentMentionType[];
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
  currentConversation: ConversationPublicType | undefined,
  event: AgentMessageNewEvent | UserMessageNewEvent
) {
  if (!currentConversation || !currentConversation) {
    return undefined;
  }

  // Check if the message already exists in the cache.
  const isMessageAlreadyInCache = currentConversation.content.some((messages) =>
    messages.some((message) => message.sId === event.message.sId)
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
  currentConversation: ConversationPublicType | undefined,
  messageOrPlaceholder: UserMessageType | AgentMessagePublicType
): ConversationPublicType {
  if (!currentConversation || currentConversation.content.length === 0) {
    throw new Error("Conversation not found");
  }

  const conversation: ConversationPublicType = {
    ...currentConversation,
    content: [...currentConversation.content],
  };

  // To please typescript
  const message =
    messageOrPlaceholder.type === "user_message"
      ? [messageOrPlaceholder]
      : [messageOrPlaceholder];

  conversation.content.push(message);

  return conversation;
}

export async function postConversation(
  platform: PlatformService,
  {
    dustAPI,
    messageData,
    visibility = "unlisted",
  }: {
    dustAPI: DustAPI;
    messageData: {
      input: string;
      mentions: AgentMentionType[];
      contentFragments: ContentFragmentsType;
    };
    visibility?: ConversationVisibility;
  }
): Promise<Result<ConversationPublicType, SubmitMessageError>> {
  const { input, mentions, contentFragments } = messageData;
  const user = await platform.auth.getStoredUser();

  if (!user) {
    // This should never happen.
    return new Err({
      type: "user_not_found",
      title: "User not found.",
      message: "Please log in again.",
    });
  }

  // Create new conversation and post the initial message at the same time.
  const cRes = await dustAPI.createConversation({
    title: null,
    visibility,
    message: {
      content: input,
      context: {
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        profilePictureUrl: user.image,
        origin: "extension",
      },
      mentions,
    },
    contentFragments: [
      ...contentFragments.uploaded.map((contentFragment) => ({
        title: contentFragment.title,
        fileId: contentFragment.fileId,
        url: contentFragment.url ?? null,
        context: {
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          profilePictureUrl: user.image,
        },
      })),
      ...contentFragments.contentNodes.map((contentNode) => ({
        title: contentNode.title,
        nodeId: contentNode.internalId,
        fileId: undefined,
        nodeDataSourceViewId: contentNode.dataSourceView.sId,
        contentType: contentNode.mimeType,
        context: {
          username: user.username,
          email: user.email,
          fullName: user.fullName,
          profilePictureUrl: user.image,
        },
      })),
    ],
    blocking: false, // We want streaming.
  });

  if (!cRes.isOk()) {
    return new Err({
      type:
        cRes.error.type === "plan_message_limit_exceeded"
          ? "plan_limit_reached_error"
          : "message_send_error",
      title: "Your message could not be sent.",
      message: cRes.error.message || "Please try again or contact us.",
    });
  }

  const conversationData = await cRes.value;

  return new Ok(conversationData.conversation);
}

export async function postMessage(
  platform: PlatformService,
  {
    dustAPI,
    conversationId,
    messageData,
  }: {
    dustAPI: DustAPI;
    conversationId: string;
    messageData: {
      input: string;
      mentions: AgentMentionType[];
      contentFragments: ContentFragmentsType;
    };
  }
): Promise<
  Result<
    { message: UserMessageType; contentFragments: ContentFragmentType[] },
    SubmitMessageError
  >
> {
  const { input, mentions, contentFragments } = messageData;
  const user = await platform.auth.getStoredUser();

  if (!user) {
    // This should never happen.
    return new Err({
      type: "user_not_found",
      title: "User not found.",
      message: "Please log in again.",
    });
  }

  const createdContentFragments: ContentFragmentType[] = [];

  // Create a new content fragment.
  if (
    contentFragments.uploaded.length > 0 ||
    contentFragments.contentNodes.length > 0
  ) {
    const contentFragmentsRes = await Promise.all([
      ...contentFragments.uploaded.map(async (file) => {
        // Only for tab contents, we re-use the content fragment ID based on the URL and conversation ID.
        const supersededContentFragmentId: string | undefined =
          (await platform.getFileContentFragmentId(conversationId, file)) ??
          undefined;

        return dustAPI.postContentFragment({
          conversationId,
          contentFragment: {
            title: file.title,
            fileId: file.fileId,
            url: file.url ?? null,
            context: {
              username: user.username,
              email: user.email,
              fullName: user.fullName,
              profilePictureUrl: user.image,
            },
            supersededContentFragmentId,
          },
        });
      }),
      ...contentFragments.contentNodes.map((file) =>
        dustAPI.postContentFragment({
          conversationId,
          contentFragment: {
            title: file.title,
            nodeId: file.internalId,
            nodeDataSourceViewId: file.dataSourceView.sId,
            contentType: file.mimeType,
            context: {
              username: user.username,
              email: user.email,
              fullName: user.fullName,
              profilePictureUrl: user.image,
            },
          },
        })
      ),
    ]);

    for (const mcfRes of contentFragmentsRes) {
      if (mcfRes.isErr()) {
        console.error("Error creating content fragment", mcfRes.error);
        return new Err({
          type: "attachment_upload_error",
          title: "Error uploading file.",
          message: mcfRes.error.message || "Please try again or contact us.",
        });
      } else {
        createdContentFragments.push(mcfRes.value);
      }
    }
  }

  const mRes = await dustAPI.postUserMessage({
    conversationId,
    message: {
      content: input,
      context: {
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        profilePictureUrl: user.image,
        origin: "extension",
      },
      mentions,
    },
  });

  if (!mRes.isOk()) {
    if (mRes.error.type === "content_too_large") {
      return new Err({
        type: "content_too_large",
        title: "Your message could not be sent.",
        message: mRes.error.message || "Please try again or contact us.",
      });
    }
    return new Err({
      type:
        mRes.error.type === "plan_message_limit_exceeded"
          ? "plan_limit_reached_error"
          : "message_send_error",
      title: "Your message could not be sent.",
      message: mRes.error.message || "Please try again or contact us.",
    });
  }
  return new Ok({
    message: mRes.value,
    contentFragments: createdContentFragments,
  });
}

export async function retryMessage(
  platform: PlatformService,
  {
    owner,
    conversationId,
    messageId,
  }: {
    owner: LightWorkspaceType;
    conversationId: string;
    messageId: string;
  }
): Promise<Result<{ message: UserMessageWithRankType }, SubmitMessageError>> {
  const token = await platform.auth.getAccessToken();
  const user = await platform.auth.getStoredUser();

  if (!user) {
    // This should never happen.
    return new Err({
      type: "user_not_found",
      title: "User not found.",
      message: "Please log in again.",
    });
  }

  const mRes = await fetch(
    `${user.dustDomain}/api/v1/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${messageId}/retry`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (!mRes.ok) {
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
