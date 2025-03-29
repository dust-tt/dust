import type { NotificationType } from "@dust-tt/sparkle";
import type * as t from "io-ts";

import { getErrorFromResponse } from "@app/lib/swr/swr";
import type { PostConversationsResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations";
import type {
  ContentFragmentsType,
  ConversationType,
  ConversationVisibility,
  InternalPostConversationsRequestBodySchema,
  MentionType,
  Result,
  SubmitMessageError,
  SupportedContentNodeContentType,
  UserMessageWithRankType,
  UserType,
  WorkspaceType,
} from "@app/types";
import { Err, isSupportedContentNodeFragmentContentType, Ok } from "@app/types";

/**
 * id of the parent div that should be scrolled for autosrcolling to work on
 * conversations
 */
export const CONVERSATION_PARENT_SCROLL_DIV_ID = {
  modal: "modal-content",
  page: "main-content",
};

export type ContentFragmentInput = {
  title: string;
  content: string;
  file: File;
};

export const createThreadVersionParam = (threadVersion?: number) => {
  const urlParams = new URLSearchParams();

  if (threadVersion !== undefined) {
    urlParams.set("threadVersion", threadVersion.toString());
  }
  const threadVersionParam =
    urlParams.size > 0 ? `?${urlParams.toString()}` : "";

  return threadVersionParam;
};

export const parseThreadVersionParam = (
  threadVersion: string | string[] | undefined
) => {
  return typeof threadVersion === "string" &&
    Number.isFinite(Number(threadVersion))
    ? Number(threadVersion)
    : undefined;
};

export function createPlaceholderUserMessage({
  input,
  mentions,
  user,
  lastMessageRank,
  threadVersion,
}: {
  input: string;
  mentions: MentionType[];
  user: UserType;
  lastMessageRank: number;
  threadVersion: number;
}): UserMessageWithRankType {
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
    rank: lastMessageRank + 1,
    threadVersions: [threadVersion],
    previousThreadVersion: null,
    nextThreadVersion: null,
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

export async function submitMessage({
  owner,
  user,
  conversationId,
  messageData,
  threadVersion,
}: {
  owner: WorkspaceType;
  user: UserType;
  conversationId: string;
  messageData: {
    input: string;
    mentions: MentionType[];
    contentFragments: ContentFragmentsType;
  };
  threadVersion?: number;
}): Promise<Result<{ message: UserMessageWithRankType }, SubmitMessageError>> {
  const { input, mentions, contentFragments } = messageData;

  // Create a new content fragment.
  if (
    contentFragments.uploaded.length > 0 ||
    contentFragments.contentNodes.length > 0
  ) {
    const contentFragmentsRes = await Promise.all([
      ...contentFragments.uploaded.map((contentFragment) => {
        return fetch(
          `/api/w/${owner.sId}/assistant/conversations/${conversationId}/content_fragment${createThreadVersionParam(threadVersion)}`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              title: contentFragment.title,
              fileId: contentFragment.fileId,
              context: {
                timezone:
                  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
                profilePictureUrl: user.image,
              },
            }),
          }
        );
      }),
      ...contentFragments.contentNodes.map((contentFragment) => {
        return fetch(
          `/api/w/${owner.sId}/assistant/conversations/${conversationId}/content_fragment`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              title: contentFragment.title,
              nodeId: contentFragment.internalId,
              nodeDataSourceViewId: contentFragment.dataSourceView.sId,
              context: {
                timezone:
                  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
                profilePictureUrl: user.image,
              },
            }),
          }
        );
      }),
    ]);

    for (const mcfRes of contentFragmentsRes) {
      if (!mcfRes.ok) {
        const data = await mcfRes.json();
        console.error("Error creating content fragment", data);
        return new Err({
          type: "attachment_upload_error",
          title: "Error uploading file.",
          message: data.error.message || "Please try again or contact us.",
        });
      }
    }
  }

  // Create a new user message.
  const mRes = await fetch(
    `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages${createThreadVersionParam(threadVersion)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: input,
        context: {
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          profilePictureUrl: user.image,
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

export async function deleteConversation({
  workspaceId,
  conversationId,
  sendNotification,
}: {
  workspaceId: string;
  conversationId: string;
  sendNotification: (notification: NotificationType) => void;
}) {
  const res = await fetch(
    `/api/w/${workspaceId}/assistant/conversations/${conversationId}`,
    {
      method: "DELETE",
    }
  );

  if (!res.ok) {
    const errorData = await getErrorFromResponse(res);

    sendNotification({
      title: "Error deleting conversation.",
      description: errorData.message,
      type: "error",
    });
    return false;
  }
  return true;
}

export async function createConversationWithMessage({
  owner,
  user,
  messageData,
  visibility = "unlisted",
  title,
}: {
  owner: WorkspaceType;
  user: UserType;
  messageData: {
    input: string;
    mentions: MentionType[];
    contentFragments: ContentFragmentsType;
  };
  visibility?: ConversationVisibility;
  title?: string;
}): Promise<Result<ConversationType, SubmitMessageError>> {
  const { input, mentions, contentFragments } = messageData;

  const body: t.TypeOf<typeof InternalPostConversationsRequestBodySchema> = {
    title: title ?? null,
    visibility,
    message: {
      content: input,
      context: {
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        profilePictureUrl: user.image,
      },
      mentions,
    },
    contentFragments: [
      ...contentFragments.uploaded.map((cf) => ({
        title: cf.title,

        context: {
          profilePictureUrl: user.image,
        },
        fileId: cf.fileId,
      })),
      ...contentFragments.contentNodes.map((cf) => {
        const contentType = isSupportedContentNodeFragmentContentType(
          cf.mimeType
        )
          ? (cf.mimeType as SupportedContentNodeContentType)
          : null;
        if (!contentType) {
          throw new Error(
            `Unsupported content node fragment mime type: ${cf.mimeType}`
          );
        }

        return {
          title: cf.title,
          context: {
            profilePictureUrl: user.image,
          },
          nodeId: cf.internalId,
          nodeDataSourceViewId: cf.dataSourceView.sId,
        };
      }),
    ],
  };

  // Create new conversation and post the initial message at the same time.
  const cRes = await fetch(`/api/w/${owner.sId}/assistant/conversations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

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

  const conversationData = (await cRes.json()) as PostConversationsResponseBody;

  return new Ok(conversationData.conversation);
}
