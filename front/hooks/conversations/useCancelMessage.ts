import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback } from "react";

export function useCancelMessage({
  owner,
  conversationId,
}: {
  owner: LightWorkspaceType;
  conversationId?: string | null;
}) {
  const sendNotification = useSendNotification();

  return useCallback(
    async (messageIds: string[]) => {
      if (!conversationId || messageIds.length === 0) {
        return;
      }
      try {
        await clientFetch(
          `/api/w/${owner.sId}/assistant/conversations/${conversationId}/cancel`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "cancel", messageIds }),
          }
        );
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        // biome-ignore lint/correctness/noUnusedVariables: ignored using `--suppress`
      } catch (error) {
        sendNotification({ type: "error", title: "Failed to cancel message" });
      }
    },
    [owner.sId, conversationId, sendNotification]
  );
}
