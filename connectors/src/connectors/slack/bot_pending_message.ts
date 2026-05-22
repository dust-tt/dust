import type { SlackStreamHandler } from "@connectors/connectors/slack/chat/slack_stream_handler";
import { reportSlackUsage } from "@connectors/connectors/slack/lib/slack_client";
import { makeConversationUrl } from "@connectors/lib/bot/conversation_utils";
import logger from "@connectors/logger/logger";
import type { ConnectorResource } from "@connectors/resources/connector_resource";
import type {
  APIError,
  ConversationPublicType,
  DustAPI,
  Result,
  UserMessageType,
} from "@dust-tt/client";
import { Err, normalizeError, Ok } from "@dust-tt/client";
import type { WebClient } from "@slack/web-api";

const SLACK_PENDING_PROMOTION_RECONNECT_DELAY_MS = 1_000;
const SLACK_PENDING_PROMOTION_RECONNECT_ATTEMPT_BUFFER = 2;

type SlackPendingConversation = {
  sId: string;
  content: {
    type: "user_message" | "agent_message" | "content_fragment";
    parentMessageId?: string | null;
  }[][];
};

type SlackPendingUserMessageDustAPI<
  TConversation extends SlackPendingConversation,
> = Pick<DustAPI, "streamConversationEvents"> & {
  getConversation: (params: {
    conversationId: string;
  }) => Promise<Result<TConversation, APIError>>;
};

function hasAgentMessageForUserMessage(
  conversation: SlackPendingConversation,
  userMessageId: string
): boolean {
  return conversation.content.some((messageVersions) => {
    const message = messageVersions.at(-1);
    return (
      message?.type === "agent_message" &&
      message.parentMessageId === userMessageId
    );
  });
}

async function waitForSlackUserMessagePromotion({
  dustAPI,
  conversationId,
  timeoutMs,
  userMessageId,
}: {
  dustAPI: Pick<DustAPI, "streamConversationEvents">;
  conversationId: string;
  timeoutMs: number;
  userMessageId: string;
}): Promise<Result<undefined, Error | APIError>> {
  const abortController = new AbortController();
  const timeout = setTimeout(() => {
    abortController.abort();
  }, timeoutMs);
  const handleStreamError = (error: unknown) =>
    abortController.signal.aborted
      ? new Ok(undefined)
      : new Err(normalizeError(error));

  try {
    const streamRes = await dustAPI.streamConversationEvents({
      conversationId,
      signal: abortController.signal,
      options: {
        maxReconnectAttempts:
          Math.ceil(timeoutMs / SLACK_PENDING_PROMOTION_RECONNECT_DELAY_MS) +
          SLACK_PENDING_PROMOTION_RECONNECT_ATTEMPT_BUFFER,
        reconnectDelay: SLACK_PENDING_PROMOTION_RECONNECT_DELAY_MS,
      },
    });
    if (streamRes.isErr()) {
      return handleStreamError(streamRes.error);
    }

    try {
      for await (const event of streamRes.value.eventStream) {
        if (
          event.type === "user_message_promoted" &&
          event.messageId === userMessageId
        ) {
          return new Ok(undefined);
        }
      }
    } catch (error) {
      return handleStreamError(error);
    }
  } finally {
    clearTimeout(timeout);
  }

  return new Ok(undefined);
}

async function stopSlackStreamBestEffort({
  connector,
  conversation,
  streamHandler,
  userMessage,
}: {
  connector: Pick<ConnectorResource, "id">;
  conversation: Pick<SlackPendingConversation, "sId">;
  streamHandler: Pick<SlackStreamHandler, "stop">;
  userMessage: Pick<UserMessageType, "sId">;
}) {
  try {
    await streamHandler.stop();
  } catch (error) {
    logger.warn(
      {
        error,
        connectorId: connector.id,
        conversationId: conversation.sId,
        userMessageId: userMessage.sId,
      },
      "Failed to stop Slack stream before posting pending user message fallback."
    );
  }
}

export async function resolveSlackPendingUserMessage<
  TConversation extends SlackPendingConversation = ConversationPublicType,
>({
  connector,
  conversation,
  dustAPI,
  slack,
  streamHandler,
  timeoutMs,
  userMessage,
}: {
  connector: Pick<ConnectorResource, "id" | "workspaceId">;
  conversation: TConversation;
  dustAPI: SlackPendingUserMessageDustAPI<TConversation>;
  slack: {
    slackChannelId: string;
    slackClient: { chat: Pick<WebClient["chat"], "postMessage"> };
    slackMessageTs: string;
  };
  streamHandler: Pick<SlackStreamHandler, "stop">;
  timeoutMs: number;
  userMessage: Pick<UserMessageType, "sId" | "visibility">;
}): Promise<Result<TConversation | null, Error | APIError>> {
  if (userMessage.visibility !== "pending") {
    return new Ok(conversation);
  }
  if (hasAgentMessageForUserMessage(conversation, userMessage.sId)) {
    return new Ok(conversation);
  }

  logger.info(
    {
      connectorId: connector.id,
      conversationId: conversation.sId,
      userMessageId: userMessage.sId,
    },
    "Slack user message is pending, waiting for promotion before streaming."
  );

  const waitRes = await waitForSlackUserMessagePromotion({
    dustAPI,
    conversationId: conversation.sId,
    timeoutMs,
    userMessageId: userMessage.sId,
  });
  if (waitRes.isErr()) {
    return waitRes;
  }

  // The promotion event only carries the user message id. Refetch once to get the
  // new agent message id before streaming; otherwise the SDK opens a second
  // conversation-events stream and refetches internally.
  const conversationRes = await dustAPI.getConversation({
    conversationId: conversation.sId,
  });

  if (
    conversationRes.isOk() &&
    hasAgentMessageForUserMessage(conversationRes.value, userMessage.sId)
  ) {
    return new Ok(conversationRes.value);
  }

  if (conversationRes.isErr()) {
    logger.warn(
      {
        error: conversationRes.error,
        connectorId: connector.id,
        conversationId: conversation.sId,
        userMessageId: userMessage.sId,
      },
      "Failed to refetch Slack conversation after pending user message timeout."
    );
  }

  await stopSlackStreamBestEffort({
    connector,
    conversation,
    streamHandler,
    userMessage,
  });

  const conversationUrl = makeConversationUrl(
    connector.workspaceId,
    conversation.sId
  );
  const fallbackText = `:hourglass_flowing_sand: _Dust is still finishing the previous request, so this Slack reply could not start in time.${
    conversationUrl ? ` <${conversationUrl}|Continue on Dust>.` : ""
  }_`;

  try {
    reportSlackUsage({
      connectorId: connector.id,
      method: "chat.postMessage",
      channelId: slack.slackChannelId,
      useCase: "bot",
    });
    await slack.slackClient.chat.postMessage({
      channel: slack.slackChannelId,
      text: fallbackText,
      thread_ts: slack.slackMessageTs,
      unfurl_links: false,
    });
  } catch (error) {
    logger.error(
      {
        error,
        connectorId: connector.id,
        conversationId: conversation.sId,
        userMessageId: userMessage.sId,
      },
      "Failed to post Slack pending user message fallback."
    );
  }

  logger.info(
    {
      connectorId: connector.id,
      conversationId: conversation.sId,
      userMessageId: userMessage.sId,
    },
    "Posted Slack pending user message fallback after promotion timeout."
  );

  return new Ok(null);
}
