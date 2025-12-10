import { useCallback, useState } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { useConversations } from "@app/lib/swr/conversations";
import type { ConversationWithoutContentType, WorkspaceType } from "@app/types";

interface useMarkAllConversationsAsReadParams {
  owner: WorkspaceType;
}

export function useMarkAllConversationsAsRead({
  owner,
}: useMarkAllConversationsAsReadParams) {
  const [isMarkingAllAsRead, setIsMarkingAllAsRead] = useState(false);
  const sendNotification = useSendNotification();
  const { mutateConversations } = useConversations({
    workspaceId: owner.sId,
    options: {
      disabled: true,
    },
  });

  const markAllAsRead = useCallback(
    async (conversations: ConversationWithoutContentType[]) => {
      if (conversations.length === 0) {
        return;
      }

      setIsMarkingAllAsRead(true);

      const total = conversations.length;
      const conversationIds = conversations.map((c) => c.sId);

      try {
        const response = await clientFetch(
          `/api/w/${owner.sId}/assistant/conversations/bulk-actions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              action: "mark_as_read",
              conversationIds,
            }),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to mark conversations as read");
        }

        const { success } = await response.json();

        if (!success) {
          throw new Error("Failed to mark conversations as read");
        }

        void mutateConversations();

        sendNotification({
          type: "success",
          title: "All conversations marked as read",
          description: `${total} conversation${total > 1 ? "s" : ""} marked as read.`,
        });
      } catch {
        sendNotification({
          type: "error",
          title: "Failed to mark conversations as read",
          description: `Could not mark the ${total > 1 ? "conversations" : "conversation"} as read.`,
        });
      } finally {
        setIsMarkingAllAsRead(false);
      }
    },
    [owner.sId, mutateConversations, sendNotification]
  );

  return {
    markAllAsRead,
    isMarkingAllAsRead,
  };
}
