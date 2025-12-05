import type { WebClient } from "@slack/web-api";
import type { MessageElement } from "@slack/web-api/dist/types/response/ConversationsRepliesResponse";

import {
  getBotOrUserName,
  getUserName,
} from "@connectors/connectors/slack/lib/bot_user_helpers";
import type { CoreAPIDataSourceDocumentSection } from "@connectors/lib/data_sources";
import { renderDocumentTitleAndContent } from "@connectors/lib/data_sources";
import type { DataSourceConfig, ModelId } from "@connectors/types";
import { safeSubstring } from "@connectors/types";

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
    const userName = await getUserName(userId, connectorId, slackClient);
    if (!userName) {
      continue;
    }

    message = message.replace(m, `@${userName}`);
  }

  return message;
}

function formatDateForUpsert(date: Date) {
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  const hours = date.getHours().toString().padStart(2, "0");
  const minutes = date.getMinutes().toString().padStart(2, "0");

  return `${year}${month}${day} ${hours}:${minutes}`;
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
      const text = await processMessageForMentions(
        message.text as string,
        connectorId,
        slackClient
      );

      const authorName = await getBotOrUserName(
        message,
        connectorId,
        slackClient
      );
      const messageDate = new Date(parseInt(message.ts as string, 10) * 1000);
      const messageDateStr = formatDateForUpsert(messageDate);

      const filesInfo = message.files
        ? "\n" +
          message.files
            .map((file) => {
              return `Attached file : ${file.name} ( ${file.mimetype} )`;
            })
            .join("\n")
        : "";

      return {
        messageDate,
        dateStr: messageDateStr,
        authorName,
        text: text + filesInfo,
        content: text + "\n",
        sections: [],
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
        prefix: `>> @${d.authorName} [${d.dateStr}]:\n`,
        content: d.text + "\n",
        sections: [],
      })),
    },
  });
}
