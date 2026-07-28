import {
  getBotOrUserName,
  getUserInfo,
} from "@connectors/connectors/slack/lib/bot_user_helpers";
import { getChannelNameById } from "@connectors/connectors/slack/lib/channels";
import { splitSlackAttachments } from "@connectors/connectors/slack/lib/message_attachments";
import {
  EMPTY_SECTION,
  formatSlackMessageForLLM,
} from "@connectors/connectors/slack/lib/message_formatter";
import type { CoreAPIDataSourceDocumentSection } from "@connectors/lib/data_sources";
import { renderDocumentTitleAndContent } from "@connectors/lib/data_sources";
import { formatDateForUpsert } from "@connectors/lib/formatting";
import type { DataSourceConfig, ModelId } from "@connectors/types";
import { safeSubstring } from "@connectors/types";
import type { WebClient } from "@slack/web-api";
import type { MessageElement } from "@slack/web-api/dist/types/response/ConversationsRepliesResponse";

// `<@U123>` and `<#C123>`: Slack sends mentions as bare ids (no label) in both rich_text and
// mrkdwn, and the formatter leaves these tokens intact for us to resolve here.
const USER_MENTION_RE = /<@[UW][A-Z0-9]+>/g;
const CHANNEL_MENTION_RE = /<#[A-Z0-9]+>/g;

// Resolves a single mention token to its display form via the Slack API: `<@U123>` -> `@name`,
// `<#C123>` -> `#name`, falling back to the raw id when it does not resolve.
async function resolveMentionToken(
  token: string,
  connectorId: ModelId,
  slackClient: WebClient
): Promise<string> {
  const id = token.replace(/[<@#>]/g, "");
  if (token.startsWith("<@")) {
    const { name } = await getUserInfo(id, connectorId, slackClient);
    return `@${name ?? id}`;
  }
  const name = await getChannelNameById(connectorId, slackClient, id);
  return `#${name ?? id}`;
}

// Resolves every user/channel mention token the formatter left in the rendered body.
async function processMessageForMentions(
  body: string,
  connectorId: ModelId,
  slackClient: WebClient
): Promise<string> {
  const tokens = new Set([
    ...(body.match(USER_MENTION_RE) ?? []),
    ...(body.match(CHANNEL_MENTION_RE) ?? []),
  ]);

  let resolved = body;
  for (const token of tokens) {
    resolved = resolved.replaceAll(
      token,
      await resolveMentionToken(token, connectorId, slackClient)
    );
  }
  return resolved;
}

// Single entry point to turn a Slack message into its upsert body text: renders the
// content (blocks first, top-level `text` as a fallback), appends forwarded (unfurl)
// messages, then resolves the mention tokens left in the assembled body.
async function formatSlackMessageBody(
  message: MessageElement,
  connectorId: ModelId,
  slackClient: WebClient
): Promise<string> {
  const { nonUnfurlAttachments, forwardedMessagesText } = splitSlackAttachments(
    message.attachments
  );

  const formatted = formatSlackMessageForLLM({
    text: message.text,
    blocks: message.blocks,
    attachments: nonUnfurlAttachments,
    files: message.files,
  });

  // `blocks` is the authoritative content of a Slack message; the top-level `text` is
  // Slack's fallback rendering of the same thing, so rendering both would duplicate it.
  // We render the blocks and only fall back to `text` when the message has none (rare bot
  // alerts). Attachments (content cards, link previews) render alongside either way.
  const mainContent =
    formatted.blocks !== EMPTY_SECTION ? formatted.blocks : formatted.text;

  // `content` has a single text slot, so flatten the sections into one string,
  // dropping the ones the formatter marked empty.
  const body = [mainContent, formatted.attachments, formatted.files]
    .filter((s) => s !== EMPTY_SECTION)
    .join("\n");

  const assembled = forwardedMessagesText
    ? `${body}\n${forwardedMessagesText}`
    : body;

  return processMessageForMentions(assembled, connectorId, slackClient);
}

export async function formatMessagesForUpsert({
  dataSourceConfig,
  channelName,
  messages,
  isThread,
  connectorId,
  slackClient,
}: {
  dataSourceConfig: DataSourceConfig;
  channelName: string;
  messages: MessageElement[];
  isThread: boolean;
  connectorId: ModelId;
  slackClient: WebClient;
}): Promise<CoreAPIDataSourceDocumentSection> {
  const data = await Promise.all(
    messages.map(async (message) => {
      let authorName: string | null;
      let authorEmail: string | null = null;
      if (message.bot_id) {
        authorName = await getBotOrUserName(message, connectorId, slackClient);
      } else {
        ({ name: authorName, email: authorEmail } = await getUserInfo(
          message.user as string,
          connectorId,
          slackClient
        ));
      }
      const messageDate = new Date(parseInt(message.ts as string, 10) * 1000);
      const messageDateStr = formatDateForUpsert(messageDate);

      const text = await formatSlackMessageBody(
        message,
        connectorId,
        slackClient
      );

      return {
        messageDate,
        dateStr: messageDateStr,
        authorName,
        authorEmail,
        text,
      };
    })
  );

  const first = data.at(0);
  const last = data.at(-1);
  if (!last || !first) {
    throw new Error("Cannot format empty list of messages");
  }

  const title = isThread
    ? `Thread in #${channelName}: ${
        safeSubstring(first.text.replace(/\s+/g, " ").trim(), 0, 128) + "..."
      }`
    : `Messages in #${channelName}`;

  return renderDocumentTitleAndContent({
    dataSourceConfig,
    title,
    createdAt: first.messageDate,
    updatedAt: last.messageDate,
    content: {
      prefix: null,
      content: null,
      sections: data.map((d) => ({
        prefix: `>> @${d.authorName}${d.authorEmail ? ` (${d.authorEmail})` : ""} [${d.dateStr}]:\n`,
        content: d.text + "\n",
        sections: [],
      })),
    },
  });
}
