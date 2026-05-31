import {
  getBotOrUserName,
  getUserInfo,
} from "@connectors/connectors/slack/lib/bot_user_helpers";
import type { CoreAPIDataSourceDocumentSection } from "@connectors/lib/data_sources";
import { renderDocumentTitleAndContent } from "@connectors/lib/data_sources";
import { formatDateForUpsert } from "@connectors/lib/formatting";
import type { DataSourceConfig, ModelId } from "@connectors/types";
import { safeSubstring } from "@connectors/types";
import { removeNulls } from "@connectors/types/shared/utils/general";
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

      const filesInfo = message.files
        ? "\n" +
          message.files
            .map((file) => {
              return `Attached file : ${file.name} ( ${file.mimetype} )`;
            })
            .join("\n")
        : "";

      // Slack renders forwarded/shared messages as message unfurl attachments.
      const forwardedMessagesText = removeNulls(
        message.attachments
          ?.filter(
            (a) =>
              a.is_msg_unfurl || a.is_reply_unfurl || a.is_thread_root_unfurl
          )
          .map((a) => {
            const forwardedMessageBody = a.text || a.fallback;
            if (!forwardedMessageBody?.trim()) {
              return null;
            }

            const forwardedMessageHeader = a.author_name
              ? `Forwarded from @${a.author_name}:`
              : "Forwarded message:";

            return `${forwardedMessageHeader}\n${forwardedMessageBody}`;
          }) ?? []
      ).join("\n---\n");

      const forwardedMessagesInfo = forwardedMessagesText
        ? `\n${forwardedMessagesText}`
        : "";

      return {
        messageDate,
        dateStr: messageDateStr,
        authorName,
        authorEmail,
        text: text + filesInfo + forwardedMessagesInfo,
        content: text + forwardedMessagesInfo + "\n",
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
        prefix: `>> @${d.authorName}${d.authorEmail ? ` (${d.authorEmail})` : ""} [${d.dateStr}]:\n`,
        content: d.text + "\n",
        sections: [],
      })),
    },
  });
}
