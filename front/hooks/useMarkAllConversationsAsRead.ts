import {
  useConversations,
  usePodConversations,
  usePodConversationsSummary,
  usePodUnreadConversationIds,
} from "@app/hooks/conversations";
import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import type { WorkspaceType } from "@app/types/user";
import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { useCallback, useState } from "react";

interface useMarkAllConversationsAsReadParams {
  owner: WorkspaceType;
  podId?: string;
}

export function useMarkAllConversationsAsRead({
  owner,
  podId,
}: useMarkAllConversationsAsReadParams) {
  const [isMarkingAllAsRead, setIsMarkingAllAsRead] = useState(false);
  const { t } = useLingui();
  const sendNotification = useSendNotification();
  const { mutateConversations } = useConversations({
    workspaceId: owner.sId,
    options: { disabled: true },
  });

  const { mutate: mutatePodSummary } = usePodConversationsSummary({
    workspaceId: owner.sId,
    options: { disabled: true },
  });

  const { mutateConversations: mutatePodConversations } = usePodConversations({
    workspaceId: owner.sId,
    podId: podId ?? null,
    options: { disabled: true },
  });

  const { mutateUnreadConversationIds } = usePodUnreadConversationIds({
    workspaceId: owner.sId,
    podId: podId ?? null,
    options: { disabled: true },
  });

  const markAllAsRead = useCallback(
    async (conversationIds: string[]) => {
      if (conversationIds.length === 0) {
        return;
      }

      setIsMarkingAllAsRead(true);

      const total = conversationIds.length;
      const markedIds = new Set(conversationIds);
      const nowMs = Date.now();

      void mutateConversations(
        (prev) =>
          prev?.map((c) =>
            markedIds.has(c.sId)
              ? {
                  ...c,
                  actionRequired: false,
                  unread: false,
                  lastReadMs: nowMs,
                }
              : c
          ),
        { revalidate: false }
      );

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

        sendNotification({
          type: "success",
          title: t`All conversations marked as read`,
          description: t`${plural(total, { one: "# conversation marked as read.", other: "# conversations marked as read." })}`,
        });

        // Unread pod conversations are rendered from these caches, so hold
        // the loading state until they refresh and the rows animate out.
        // allSettled: a failed revalidation keeps stale data but is not a
        // mark-as-read failure.
        await Promise.allSettled([
          mutatePodSummary(),
          mutatePodConversations(),
          mutateUnreadConversationIds(),
        ]);
      } catch {
        void mutateConversations();

        sendNotification({
          type: "error",
          title: t`Failed to mark conversations as read`,
          description: t`${plural(total, { one: "Could not mark the conversation as read.", other: "Could not mark the conversations as read." })}`,
        });
      } finally {
        setIsMarkingAllAsRead(false);
      }
    },
    [
      owner.sId,
      mutateConversations,
      mutatePodSummary,
      mutatePodConversations,
      sendNotification,
      mutateUnreadConversationIds,
      t,
    ]
  );

  return {
    markAllAsRead,
    isMarkingAllAsRead,
  };
}
