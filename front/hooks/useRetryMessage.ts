import { useCallback } from "react";

import { clientFetch } from "@app/lib/egress/client";
import type { LightWorkspaceType } from "@app/types";

export function useRetryMessage({ owner }: { owner: LightWorkspaceType }) {
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
      await clientFetch(
        `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${messageId}/retry?blocked_only=${blockedOnly}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
    },
    [owner.sId]
  );
}
