import { useCallback } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import {
  useConversation,
  useConversations,
} from "@app/lib/swr/conversations";
import type { LightWorkspaceType } from "@app/types";

export function useUpdateConversationTitle({
  owner,
  conversationId,
}: {
  owner: LightWorkspaceType;
  conversationId: string | null;
}) {
  const sendNotification = useSendNotification();
  const { mutateConversation } = useConversation({
    conversationId,
    workspaceId: owner.sId,
    options: { disabled: true },
  });
  const { mutateConversations } = useConversations({
    workspaceId: owner.sId,
    options: { disabled: true },
  });

  return useCallback(
    async (title: string): Promise<boolean> => {
      if (!conversationId) {
        return false;
      }

      const response = await clientFetch(
        `/api/w/${owner.sId}/assistant/conversations/${conversationId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ title }),
        }
      );

      if (!response.ok) {
        sendNotification({ type: "error", title: "Failed to edit title" });
        return false;
      }

      await mutateConversation();
      void mutateConversations();
      sendNotification({ type: "success", title: "Title edited" });
      return true;
    },
    [owner.sId, conversationId, mutateConversation, mutateConversations, sendNotification]
  );
}
