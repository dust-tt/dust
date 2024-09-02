import type { WebClient } from "@slack/web-api";
import type { MessageElement } from "@slack/web-api/dist/response/ConversationsHistoryResponse";
import type { ConversationsRepliesResponse } from "@slack/web-api/dist/response/ConversationsRepliesResponse";

import mainLogger from "@connectors/logger/logger";

const logger = mainLogger.child({ provider: "slack" });

// The pagination logic for getting all the messages of a Slack thread
// is a bit complicated, so we put it in a separate function.
export async function getRepliesFromThread({
  slackClient,
  channelId,
  threadTs,
}: {
  slackClient: WebClient;
  channelId: string;
  threadTs: string;
}) {
  let allMessages: MessageElement[] = [];

  let iteration = 0;
  let next_cursor: string | undefined = undefined;
  do {
    const now = new Date();

    const replies: ConversationsRepliesResponse =
      await slackClient.conversations.replies({
        channel: channelId,
        ts: threadTs,
        cursor: next_cursor,
        limit: 200,
      });

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
