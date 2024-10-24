import {
  getAccessToken,
  getStoredUser,
} from "@app/extension/app/src/lib/storage";
import type {
  ConversationType,
  ConversationVisibility,
  LightWorkspaceType,
  MentionType,
  PublicPostConversationsRequestBody,
  Result,
  SubmitMessageError,
  UserMessageWithRankType,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";

export async function postConversation({
  owner,
  messageData,
  visibility = "unlisted",
  title,
}: {
  owner: LightWorkspaceType;
  messageData: {
    input: string;
    mentions: MentionType[];
  };
  visibility?: ConversationVisibility;
  title?: string;
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
    title: title ?? null,
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
    contentFragment: undefined,
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

// Not called yet so not tested
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
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
          profilePictureUrl: null, // todo daph
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
