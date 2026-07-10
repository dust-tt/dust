import { removeNulls } from "@connectors/types/shared/utils/general";
import type { MessageElement } from "@slack/web-api/dist/types/response/ConversationsRepliesResponse";

type UnfurlAttachment = NonNullable<MessageElement["attachments"]>[number];

export function isUnfurlAttachment(attachment: UnfurlAttachment): boolean {
  return Boolean(
    attachment.is_msg_unfurl ||
      attachment.is_reply_unfurl ||
      attachment.is_thread_root_unfurl
  );
}

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
