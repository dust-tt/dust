import { useConversations } from "@app/hooks/conversations";
import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback } from "react";

export function useDeleteConversation(owner: LightWorkspaceType) {
  const sendNotification = useSendNotification();
  const { mutateConversations } = useConversations({ workspaceId: owner.sId });

  return useCallback(
    async (
      conversation?: ConversationWithoutContentType,
      forceDelete: boolean = false
    ): Promise<boolean> => {
      if (!conversation) {
        return false;
      }

      const res = await clientFetch(
        `/api/w/${owner.sId}/assistant/conversations/${conversation.sId}?forceDelete=${forceDelete}`,
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

      void mutateConversations(
        (prevState: ConversationWithoutContentType[] | undefined) =>
          prevState?.filter((c) => c.sId !== conversation.sId)
      );

      return true;
    },
    [owner.sId, mutateConversations, sendNotification]
  );
}
