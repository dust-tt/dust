import { useConversations } from "@app/hooks/conversations";
import { useSendNotification } from "@app/hooks/useNotification";
import { useFetcher } from "@app/lib/swr/swr";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { isAPIErrorResponse } from "@app/types/error";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback } from "react";

export function useDeleteConversation(owner: LightWorkspaceType) {
  const sendNotification = useSendNotification();
  const { mutateConversations } = useConversations({ workspaceId: owner.sId });
  const { fetcher } = useFetcher();

  return useCallback(
    async (
      conversation?: ConversationWithoutContentType,
      forceDelete: boolean = false
    ): Promise<boolean> => {
      if (!conversation) {
        return false;
      }

      try {
        await fetcher(
          `/api/w/${owner.sId}/assistant/conversations/${conversation.sId}?forceDelete=${forceDelete}`,
          {
            method: "DELETE",
          }
        );
      } catch (e) {
        if (isAPIErrorResponse(e)) {
          sendNotification({
            title: "Error deleting conversation.",
            description: e.error.message,
            type: "error",
          });
        } else {
          sendNotification({
            title: "Error deleting conversation.",
            description: "An error occurred",
            type: "error",
          });
        }
        return false;
      }

      void mutateConversations(
        (prevState: ConversationWithoutContentType[] | undefined) =>
          prevState?.filter((c) => c.sId !== conversation.sId)
      );

      return true;
    },
    [owner.sId, mutateConversations, sendNotification, fetcher]
  );
}
