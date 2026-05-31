import { removeNulls } from "@connectors/types/shared/utils/general";
import type { MessageElement } from "@slack/web-api/dist/types/response/ConversationsRepliesResponse";

export function formatSlackMessageUnfurlAttachments(
  attachments: MessageElement["attachments"]
): string {
  return removeNulls(
    attachments
      ?.filter(
        (a) => a.is_msg_unfurl || a.is_reply_unfurl || a.is_thread_root_unfurl
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
}
