import { useCallback, useState } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import { useConversationMarkAsRead } from "@app/lib/swr/conversations";
import type { ConversationWithoutContentType, WorkspaceType } from "@app/types";

interface useMarkAllConversationsAsReadParams {
  owner: WorkspaceType;
}

export function useMarkAllConversationsAsRead({
  owner,
}: useMarkAllConversationsAsReadParams) {
  const [isMarkingAllAsRead, setIsMarkingAllAsRead] = useState(false);
  const sendNotification = useSendNotification();
  const { markAsRead } = useConversationMarkAsRead({
    conversation: null,
    workspaceId: owner.sId,
  });

  const markAllAsRead = useCallback(
    async (unreadConversations: ConversationWithoutContentType[]) => {
      if (!unreadConversations || unreadConversations.length === 0) {
        return;
      }

      setIsMarkingAllAsRead(true);

      const total = unreadConversations.length;
      let successCount = 0;

      for (const conversation of unreadConversations) {
        try {
          await markAsRead(conversation.sId, true);
          successCount += 1;
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error) {
          // do nothing
        }
      }

      setIsMarkingAllAsRead(false);

      if (successCount === total) {
        sendNotification({
          type: "success",
          title: "All conversations marked as read",
          description: `${total} conversation${total > 1 ? "s" : ""} marked as read.`,
        });
      } else if (successCount === 0) {
        sendNotification({
          type: "error",
          title: "Failed to mark conversations as read",
          description: `Could not mark the ${total > 1 ? "conversations" : "conversation"} as read.`,
        });
      } else {
        sendNotification({
          type: "error",
          title: "Some conversations couldn't be marked as read",
          description: `Marked ${successCount} of ${total} conversations as read.`,
        });
      }
    },
    [markAsRead, sendNotification]
  );

  return {
    markAllAsRead,
    isMarkingAllAsRead,
  };
}
