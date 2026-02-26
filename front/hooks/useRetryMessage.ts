import { useFetcher } from "@app/lib/swr/swr";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback } from "react";

export function useRetryMessage({ owner }: { owner: LightWorkspaceType }) {
  const { fetcher } = useFetcher();

  return useCallback(
    async ({
      conversationId,
      messageId,
      blockedOnly = false,
    }: {
      conversationId: string;
      messageId: string;
      blockedOnly?: boolean;
    }): Promise<void> => {
      await fetcher(
        `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${messageId}/retry?blocked_only=${blockedOnly}`,
        {
          method: "POST",
        }
      );
    },
    [owner.sId, fetcher]
  );
}
