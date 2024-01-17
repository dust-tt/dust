import type {
  ConversationType,
  ConversationVisibility,
  InternalPostConversationsRequestBodySchema,
  MentionType,
  Result,
  UserType,
  WorkspaceType,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import type * as t from "io-ts";

import type { NotificationType } from "@app/components/sparkle/Notification";
import type { PostConversationsResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations";

export type ConversationErrorType = {
  type:
    | "attachment_upload_error"
    | "message_send_error"
    | "plan_limit_reached_error";
  title: string;
  message: string;
};

export async function submitMessage({
  owner,
  user,
  conversationId,
  messageData,
}: {
  owner: WorkspaceType;
  user: UserType;
  conversationId: string;
  messageData: {
    input: string;
    mentions: MentionType[];
    contentFragment?: {
      title: string;
      content: string;
    };
  };
}): Promise<Result<void, ConversationErrorType>> {
  const { input, mentions, contentFragment } = messageData;
  // Create a new content fragment.
  if (contentFragment) {
    const mcfRes = await fetch(
      `/api/w/${owner.sId}/assistant/conversations/${conversationId}/content_fragment`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: contentFragment.title,
          content: contentFragment.content,
          url: null,
          contentType: "file_attachment",
          context: {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
            profilePictureUrl: user.image,
          },
        }),
      }
    );

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

  // Create a new user message.
  const mRes = await fetch(
    `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages`,
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
    const data = await mRes.json();
    return new Err({
      type:
        data.error.type === "test_plan_message_limit_reached"
          ? "plan_limit_reached_error"
          : "message_send_error",
      title: "Your message could not be sent.",
      message: data.error.message || "Please try again or contact us.",
    });
  }
  return new Ok(undefined);
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
    const data = await res.json();
    sendNotification({
      title: "Error deleting conversation.",
      description: data.error.message || "Please try again or contact us.",
      type: "error",
    });
    return;
  }
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
    contentFragment?: {
      title: string;
      content: string;
    };
  };
  visibility?: ConversationVisibility;
  title?: string;
}): Promise<Result<ConversationType, ConversationErrorType>> {
  const { input, mentions, contentFragment } = messageData;
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
    contentFragment: contentFragment
      ? {
          ...contentFragment,
          contentType: "file_attachment",
          url: null,
          context: {
            profilePictureUrl: user.image,
          },
        }
      : undefined,
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
        data.error.type === "test_plan_message_limit_reached"
          ? "plan_limit_reached_error"
          : "message_send_error",
      title: "Your message could not be sent.",
      message: data.error.message || "Please try again or contact us.",
    });
  }

  return new Ok(
    ((await cRes.json()) as PostConversationsResponseBody).conversation
  );
}
