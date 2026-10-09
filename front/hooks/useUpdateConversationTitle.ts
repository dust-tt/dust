import { useConversation, useConversations } from "@app/hooks/conversations";
import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import type { LightWorkspaceType } from "@app/types/user";
import { useLingui } from "@lingui/react/macro";
import { useCallback } from "react";

export function useUpdateConversationTitle({
  owner,
  conversationId,
}: {
  owner: LightWorkspaceType;
  conversationId: string | null;
}) {
  const { t } = useLingui();
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
        sendNotification({ type: "error", title: t`Failed to edit title` });
        return false;
      }

      await mutateConversation();
      void mutateConversations(
        (prev) =>
          prev?.map((c) => (c.sId === conversationId ? { ...c, title } : c)),
        { revalidate: false }
      );
      sendNotification({ type: "success", title: t`Title edited` });
      return true;
    },
    [
      owner.sId,
      conversationId,
      mutateConversation,
      mutateConversations,
      sendNotification,
      t,
    ]
  );
}
