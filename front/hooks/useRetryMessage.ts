import type { WorkspaceLimit } from "@app/components/app/ReachedLimitPopup";
import { getWorkspaceLimitFromApiErrorType } from "@app/components/app/ReachedLimitPopup";
import { clientFetch } from "@app/lib/egress/client";
import { isAPIErrorResponse } from "@app/types/error";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback } from "react";

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
    }): Promise<Result<void, WorkspaceLimit>> => {
      const res = await clientFetch(
        `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${messageId}/retry?blocked_only=${blockedOnly}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        if (isAPIErrorResponse(body)) {
          const limitCode = getWorkspaceLimitFromApiErrorType(body.error.type);
          if (limitCode) {
            return new Err(limitCode);
          }
        }
      }
      return new Ok(undefined);
    },
    [owner.sId]
  );
}
