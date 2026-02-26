import { useConversation, useConversations } from "@app/hooks/conversations";
import { useSendNotification } from "@app/hooks/useNotification";
import { useFetcher } from "@app/lib/swr/swr";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback } from "react";

export function useUpdateConversationTitle({
  owner,
  conversationId,
}: {
  owner: LightWorkspaceType;
  conversationId: string | null;
}) {
  const sendNotification = useSendNotification();
  const { fetcherWithBody } = useFetcher();
  const { mutateConversation } = useConversation({
    conversationId,
    workspaceId: owner.sId,
    options: { disabled: true },
  });
  const { mutateConversations } = useConversations({ workspaceId: owner.sId });

  return useCallback(
    async (title: string): Promise<boolean> => {
      if (!conversationId) {
        return false;
      }

      try {
        await fetcherWithBody([
          `/api/w/${owner.sId}/assistant/conversations/${conversationId}`,
          { title },
          "PATCH",
        ]);
      } catch {
        sendNotification({ type: "error", title: "Failed to edit title" });
        return false;
      }

      await mutateConversation();
      void mutateConversations();
      sendNotification({ type: "success", title: "Title edited" });
      return true;
    },
    [
      owner.sId,
      conversationId,
      mutateConversation,
      mutateConversations,
      sendNotification,
      fetcherWithBody,
    ]
  );
}
