import type {
  PublicPostContentFragmentRequestBody,
  Result,
} from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";

import { DISCORD_API_BASE_URL } from "@connectors/api/webhooks/discord/utils";
import { apiConfig } from "@connectors/lib/api/config";
import type { Logger } from "@connectors/logger/logger";

const THREAD_CHANNEL_TYPES = [11, 12];

interface DiscordMessage {
  id: string;
  content: string;
  author: {
    id: string;
    username: string;
    bot?: boolean;
  };
  timestamp: string;
}

interface DiscordChannel {
  id: string;
  type: number;
  parent_id?: string;
}

interface DiscordContentFragmentParams {
  channelId: string;
  logger: Logger;
}

/**
 * Fetch all messages from a Discord thread and format them as content fragments for Dust.
 */
export async function makeDiscordContentFragments({
  channelId,
  logger,
}: DiscordContentFragmentParams): Promise<
  Result<PublicPostContentFragmentRequestBody[] | null, Error>
> {
  const botToken = apiConfig.getDiscordBotToken();

  // Check if this is a thread or regular channel.
  const channelInfoUrl = `${DISCORD_API_BASE_URL}/channels/${channelId}`;
  const channelResponse = await fetch(channelInfoUrl, {
    method: "GET",
    headers: {
      Authorization: `Bot ${botToken}`,
      "Content-Type": "application/json",
    },
  });

  if (!channelResponse.ok) {
    const errorText = await channelResponse.text();
    logger.error(
      {
        status: channelResponse.status,
        statusText: channelResponse.statusText,
        error: errorText,
        channelId,
      },
      "Failed to fetch Discord channel info"
    );
    return new Err(
      new Error(
        `Failed to fetch channel info: ${channelResponse.status} ${errorText}`
      )
    );
  }

  const channelInfo: DiscordChannel = await channelResponse.json();
  const isThread = THREAD_CHANNEL_TYPES.includes(channelInfo.type);
  if (!isThread) {
    logger.info(
      { channelId, channelType: channelInfo.type },
      "Skipping context fetch: command not in a thread (regular channel)"
    );
    return new Ok(null);
  }

  logger.info(
    { channelId, channelType: channelInfo.type },
    "Fetching all messages from Discord thread"
  );

  const allMessages: DiscordMessage[] = [];
  let oldestMessageId: string | undefined = undefined;
  let hasMoreMessages = true;

  while (hasMoreMessages) {
    const messagesUrl = oldestMessageId
      ? `${DISCORD_API_BASE_URL}/channels/${channelId}/messages?limit=100&before=${oldestMessageId}`
      : `${DISCORD_API_BASE_URL}/channels/${channelId}/messages?limit=100`;

    const response = await fetch(messagesUrl, {
      method: "GET",
      headers: {
        Authorization: `Bot ${botToken}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        {
          status: response.status,
          statusText: response.statusText,
          error: errorText,
          channelId,
        },
        "Failed to fetch Discord thread messages"
      );
      return new Err(
        new Error(
          `Failed to fetch Discord messages: ${response.status} ${errorText}`
        )
      );
    }

    const messages: DiscordMessage[] = await response.json();

    if (messages.length === 0) {
      hasMoreMessages = false;
    } else {
      allMessages.push(...messages);
      oldestMessageId = messages[messages.length - 1]?.id;

      // If we got fewer than 100 messages, we've reached the end.
      if (messages.length < 100) {
        hasMoreMessages = false;
      }
    }
  }

  logger.info(
    { channelId, totalMessagesFetched: allMessages.length },
    "Fetched all messages from Discord thread"
  );

  // Discord returns messages in reverse chronological order (newest first).
  // Reverse to get chronological order for context.
  const userMessages = allMessages.reverse();

  const formattedContent = userMessages
    .map((msg) => {
      const timestamp = new Date(msg.timestamp).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
      });
      return `[${timestamp} UTC] @${msg.author.username}: ${msg.content}`;
    })
    .join("\n\n");

  const contentFragment: PublicPostContentFragmentRequestBody = {
    title: `Discord thread context (${userMessages.length} messages)`,
    content: formattedContent,
    url: null,
    contentType: "text/plain",
    context: null,
  };

  return new Ok([contentFragment]);
}
