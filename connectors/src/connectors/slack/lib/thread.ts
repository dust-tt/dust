import { RATE_LIMITS } from "@connectors/connectors/slack/ratelimits";
import { throttleWithRedis } from "@connectors/lib/throttle";
import mainLogger from "@connectors/logger/logger";
import type { ModelId } from "@connectors/types";
import type { WebClient } from "@slack/web-api";
import type { MessageElement } from "@slack/web-api/dist/types/response/ConversationsHistoryResponse";

import { reportSlackUsage, withSlackErrorHandling } from "./slack_client";

const logger = mainLogger.child({ provider: "slack" });

// The pagination logic for getting all the messages of a Slack thread is a bit complicated, so we
// put it in a separate function.
export async function getRepliesFromThread({
  connectorId,
  slackClient,
  channelId,
  threadTs,
  useCase,
}: {
  connectorId: ModelId;
  slackClient: WebClient;
  channelId: string;
  threadTs: string;
  useCase: "batch_sync" | "incremental_sync" | "bot";
}) {
  let allMessages: MessageElement[] = [];

  let iteration = 0;
  let next_cursor: string | undefined = undefined;
  do {
    const now = new Date();

    reportSlackUsage({
      connectorId,
      method: "conversations.replies",
      channelId,
      limit: 200,
      useCase,
    });

    const replies = await throttleWithRedis(
      RATE_LIMITS["conversations.replies"],
      `${connectorId}-conversations-replies`,
      { canBeIgnored: false },
      () =>
        withSlackErrorHandling(() =>
          slackClient.conversations.replies({
            channel: channelId,
            ts: threadTs,
            cursor: next_cursor,
            limit: 200,
          })
        ),
      { source: "getRepliesFromThread" }
    );

    // With canBeIgnored: false, throttleWithRedis will always return a value.
    if (!replies) {
      throw new Error(
        "Unexpected undefined response from conversations.replies"
      );
    }
    if (replies.error) {
      throw new Error(replies.error);
    }
    if (!replies.messages) {
      break;
    }

    // Messages are returned in the following order:
    // [[mainMessage, m7, m8, m9], [mainMessage, m4, m5, m6], [mainMessage, m1, m2, m3]]
    //     ^ page 1                      ^ page 2                      ^ page 3

    next_cursor = replies.response_metadata?.next_cursor;
    if (!next_cursor) {
      // Last page, we keep the first message, which is the thread main message.
      allMessages = replies.messages.concat(allMessages);
    } else {
      // Not the last page, we remove the first message, which is always the thread main message.
      allMessages = replies.messages.slice(1).concat(allMessages);
    }

    logger.info(
      {
        messagesCount: allMessages.length,
        channelId,
        threadTs,
        next_cursor,
        duration: new Date().getTime() - now.getTime(),
        iteration,
      },
      "Fetched replies from channel thread."
    );
    iteration += 1;
  } while (next_cursor);

  return allMessages;
}
