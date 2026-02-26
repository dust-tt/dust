import { useSendNotification } from "@app/hooks/useNotification";
import { useFetcher } from "@app/lib/swr/swr";
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
  const { fetcherWithBody } = useFetcher();

  return useCallback(
    async (messageIds: string[]) => {
      if (!conversationId || messageIds.length === 0) {
        return;
      }
      try {
        await fetcherWithBody([
          `/api/w/${owner.sId}/assistant/conversations/${conversationId}/cancel`,
          { action: "cancel", messageIds },
          "POST",
        ]);
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        // biome-ignore lint/correctness/noUnusedVariables: ignored using `--suppress`
      } catch (error) {
        sendNotification({ type: "error", title: "Failed to cancel message" });
      }
    },
    [owner.sId, conversationId, sendNotification, fetcherWithBody]
  );
}
