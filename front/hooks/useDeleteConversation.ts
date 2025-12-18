import { useCallback } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { useConversations } from "@app/lib/swr/conversations";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import type {
  ConversationWithoutContentType,
  LightWorkspaceType,
} from "@app/types";

export function useDeleteConversation(owner: LightWorkspaceType) {
  const sendNotification = useSendNotification();
  const { mutateConversations } = useConversations({
    workspaceId: owner.sId,
    options: { disabled: true },
  });

  return useCallback(
    async (
      conversation: ConversationWithoutContentType | null
    ): Promise<boolean> => {
      if (!conversation) {
        return false;
      }

      const res = await clientFetch(
        `/api/w/${owner.sId}/assistant/conversations/${conversation.sId}`,
        {
          method: "DELETE",
        }
      );

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);

        sendNotification({
          title: "Error deleting conversation.",
          description: errorData.message,
          type: "error",
        });
        return false;
      }

      void mutateConversations((prevState) => {
        return {
          ...prevState,
          conversations:
            prevState?.conversations.filter(
              (c) => c.sId !== conversation.sId
            ) ?? [],
        };
      });

      return true;
    },
    [owner.sId, mutateConversations, sendNotification]
  );
}
