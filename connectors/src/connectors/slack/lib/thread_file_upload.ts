import { removeNulls } from "@dust-tt/client";
import type { MessageElement } from "@slack/web-api/dist/types/response/ConversationsRepliesResponse";

export type SlackThreadFile = NonNullable<MessageElement["files"]>[number];

export function selectBotThreadMessages({
  replies,
  startingAtTs,
  allowedSlackBotId,
}: {
  replies: MessageElement[];
  startingAtTs: string | null;
  allowedSlackBotId: string | undefined;
}) {
  let shouldTake = false;
  const messages: MessageElement[] = [];

  for (const reply of replies) {
    if (reply.ts === startingAtTs) {
      shouldTake = true;
    }

    const isFromAllowedBot =
      allowedSlackBotId && reply.bot_id === allowedSlackBotId;
    if (!reply.user && !isFromAllowedBot) {
      continue;
    }
    if (shouldTake) {
      messages.push(reply);
    }
  }

  return messages;
}

export function getSlackFilesFromMessages(messages: MessageElement[]) {
  return removeNulls(messages.flatMap((message) => message.files ?? []));
}

export function hasPendingSlackFileMetadata(files: SlackThreadFile[]) {
  return files.some(
    (file) => !file.mimetype || !file.size || !file.url_private_download
  );
}

export function countPendingSlackFileMetadata(files: SlackThreadFile[]) {
  let missingMimetypeCount = 0;
  let missingSizeCount = 0;
  let missingPrivateDownloadUrlCount = 0;

  for (const file of files) {
    if (!file.mimetype) {
      missingMimetypeCount += 1;
    }
    if (!file.size) {
      missingSizeCount += 1;
    }
    if (!file.url_private_download) {
      missingPrivateDownloadUrlCount += 1;
    }
  }

  return {
    missingMimetypeCount,
    missingSizeCount,
    missingPrivateDownloadUrlCount,
  };
}
