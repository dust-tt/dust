import type {
  AgentMentionType,
  AgentMessagePublicType,
  ContentFragmentType,
  ConversationPublicType,
  ConversationVisibility,
  Result,
  UserMessageType,
} from "@dust-tt/client";
import { DustAPI, Err, Ok } from "@dust-tt/client";
import {
  createAPILogger,
  DustConfig,
  loadDustConfig,
  loadTokens,
} from "./config.js";

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

const DUST_API_URL = "http://localhost:3000";

export async function getDustAPI(): Promise<{
  dustAPI: DustAPI;
  dustConfig: DustConfig;
}> {
  const tokens = await loadTokens();
  if (!tokens) {
    throw new Error("No authentication tokens found");
  }

  const dustConfig = await loadDustConfig();
  if (!dustConfig) {
    throw new Error("No Dust config found");
  }

  const apiLogger = createAPILogger();

  return {
    dustAPI: new DustAPI(
      {
        url: DUST_API_URL,
      },
      {
        apiKey: () => tokens.accessToken,
        workspaceId: dustConfig.workspaceId,
      },
      apiLogger
    ),
    dustConfig,
  };
}

export async function postConversation({
  dustAPI,
  messageData,
  visibility = "unlisted",
}: {
  dustAPI: DustAPI;
  messageData: {
    input: string;
    mentions: AgentMentionType[];
  };
  visibility?: ConversationVisibility;
}): Promise<Result<ConversationPublicType, SubmitMessageError>> {
  const { input, mentions } = messageData;
  // const userRes = await dustAPI.me();

  // if (!userRes.isOk()) {
  //   return new Err({
  //     type: "user_not_found",
  //     title: "User not found.",
  //     message: "Please log in again.",
  //   });
  // }

  // const user = userRes.value;

  // Create new conversation and post the initial message at the same time.
  const cRes = await dustAPI.createConversation({
    title: null,
    visibility,
    message: {
      content: input,
      context: {
        username: "Cursor",
        fullName: "Cursor: The AI Code Editor",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        origin: "api",
        // username: user.username,
        // email: user.email,
        // fullName: user.fullName,
        // timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        // profilePictureUrl: user.image,
        // origin: "api",
      },
      mentions,
    },
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

export async function postMessage({
  dustAPI,
  conversationId,
  messageData,
}: {
  dustAPI: DustAPI;
  conversationId: string;
  messageData: {
    input: string;
    mentions: AgentMentionType[];
  };
}): Promise<
  Result<
    { conversationId: string; message: UserMessageType },
    SubmitMessageError
  >
> {
  const { input, mentions } = messageData;
  // const userRes = await dustAPI.me();

  // if (!userRes.isOk()) {
  //   return new Err({
  //     type: "user_not_found",
  //     title: "User not found.",
  //     message: "Please log in again.",
  //   });
  // }

  // const user = userRes.value;

  const mRes = await dustAPI.postUserMessage({
    conversationId,
    message: {
      content: input,
      context: {
        username: "Cursor",
        fullName: "Cursor: The AI Code Editor",
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        origin: "api",
        // username: user.username,
        // email: user.email,
        // fullName: user.fullName,
        // timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        // profilePictureUrl: user.image,
        // origin: "api",
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

  return new Ok({ conversationId, message: mRes.value });
}

export async function streamAgentAnswer({
  dustAPI,
  conversation,
  userMessageId,
}: {
  dustAPI: DustAPI;
  conversation: ConversationPublicType;
  userMessageId: string;
}): Promise<Result<AgentMessagePublicType, SubmitMessageError>> {
  const streamRes = await dustAPI.streamAgentAnswerEvents({
    conversation,
    userMessageId,
    signal: undefined, // We don't need to cancel the stream
  });

  if (!streamRes.isOk()) {
    return new Err({
      type: "message_send_error",
      title: "Failed to get agent's answer.",
      message: streamRes.error.message || "Please try again or contact us.",
    });
  }

  // Wait for the agent to finish generating the response
  for await (const event of streamRes.value.eventStream) {
    if ("type" in event && event.type === "agent_message_success") {
      return new Ok(event.message);
    }
    if ("type" in event && event.type === "error") {
      return new Err({
        type: "message_send_error",
        title: "Failed to get agent's answer.",
        message: event.content.message || "Please try again or contact us.",
      });
    }
  }

  return new Err({
    type: "message_send_error",
    title: "Failed to get agent's answer.",
    message: "Stream ended without a complete response.",
  });
}
