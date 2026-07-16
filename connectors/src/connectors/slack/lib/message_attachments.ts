import { removeNulls } from "@connectors/types/shared/utils/general";
import type { MessageElement } from "@slack/web-api/dist/types/response/ConversationsRepliesResponse";

type Attachment = NonNullable<MessageElement["attachments"]>[number];

function isUnfurlAttachment(attachment: Attachment): boolean {
  return Boolean(
    attachment.is_msg_unfurl ||
      attachment.is_reply_unfurl ||
      attachment.is_thread_root_unfurl
  );
}

// Extracts and renders the forwarded (unfurl) attachments of a message.
export function formatSlackMessageUnfurlAttachments(
  attachments: MessageElement["attachments"]
): string {
  return removeNulls(
    attachments?.filter(isUnfurlAttachment).map((a) => {
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
}

// Splits a message's attachments into the non-unfurl ones (regular attachments,
// fed to the formatter) and the rendered text of the unfurl ones (forwarded
// messages), so an attachment is never rendered by both paths.
export function splitSlackAttachments(
  attachments: MessageElement["attachments"]
): {
  nonUnfurlAttachments: MessageElement["attachments"];
  forwardedMessagesText: string;
} {
  return {
    nonUnfurlAttachments: attachments?.filter((a) => !isUnfurlAttachment(a)),
    forwardedMessagesText: formatSlackMessageUnfurlAttachments(attachments),
  };
}
