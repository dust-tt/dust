import { useConversations } from "@app/hooks/conversations/useConversations";
import { usePodConversationsSummary } from "@app/hooks/conversations/usePodConversations";
import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import type { PatchConversationsRequestBody } from "@app/types/api/assistant/conversation/types";
import type { ConversationListItemType } from "@app/types/assistant/conversation";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback } from "react";

export function useConversationMarkAsUnread(owner: LightWorkspaceType) {
  const sendNotification = useSendNotification();

  const { mutateConversations } = useConversations({
    workspaceId: owner.sId,
    options: { disabled: true },
  });

  const { mutate: mutatePodConversationsSummary } = usePodConversationsSummary({
    workspaceId: owner.sId,
    options: { disabled: true },
  });

  return useCallback(
    async (conversation: ConversationListItemType): Promise<boolean> => {
      const res = await clientFetch(
        `/api/w/${owner.sId}/assistant/conversations/${conversation.sId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            read: false,
          } satisfies PatchConversationsRequestBody),
        }
      );

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);

        sendNotification({
          title: "Error marking conversation as unread.",
          description: errorData.message,
          type: "error",
        });
        return false;
      }

      void mutateConversations(
        (prev) =>
          prev?.map((c) =>
            c.sId === conversation.sId ? { ...c, unread: true } : c
          ),
        { revalidate: false }
      );
      void mutatePodConversationsSummary();

      return true;
    },
    [
      owner.sId,
      mutateConversations,
      mutatePodConversationsSummary,
      sendNotification,
    ]
  );
}
