import {
  getBotOrUserName,
  getUserInfo,
} from "@connectors/connectors/slack/lib/bot_user_helpers";
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

async function processMessageForMentions(
  message: string,
  connectorId: ModelId,
  slackClient: WebClient
): Promise<string> {
  const matches = message.match(/<@[A-Z-0-9]+>/g);
  if (!matches) {
    return message;
  }
  for (const m of matches) {
    const userId = m.replace(/<|@|>/g, "");
    const { name: userName } = await getUserInfo(
      userId,
      connectorId,
      slackClient
    );
    if (!userName) {
      continue;
    }

    message = message.replace(m, `@${userName}`);
  }

  return message;
}

// Single entry point to turn a Slack message into its upsert body text: resolves
// mentions, splits forwarded (unfurl) attachments from regular ones, reconstructs
// the content from text/blocks/attachments/files, and appends forwarded messages.
async function formatSlackMessageBody(
  message: MessageElement,
  connectorId: ModelId,
  slackClient: WebClient
): Promise<string> {
  const text = await processMessageForMentions(
    message.text ?? "",
    connectorId,
    slackClient
  );

  const { nonUnfurlAttachments, forwardedMessagesText } = splitSlackAttachments(
    message.attachments
  );

  const formatted = formatSlackMessageForLLM({
    text,
    blocks: message.blocks,
    attachments: nonUnfurlAttachments,
    files: message.files,
  });

  // `content` has a single text slot, so flatten the reconstructed sections into
  // one string, dropping the ones the formatter marked empty.
  const body = [
    formatted.text,
    formatted.blocks,
    formatted.attachments,
    formatted.files,
  ]
    .filter((s) => s !== EMPTY_SECTION)
    .join("\n");

  return forwardedMessagesText ? `${body}\n${forwardedMessagesText}` : body;
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
