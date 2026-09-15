import type { WorkspaceLimit } from "@app/components/app/ReachedLimitPopup";
import { getWorkspaceLimitFromApiErrorType } from "@app/components/app/ReachedLimitPopup";
import { clientFetch } from "@app/lib/egress/client";
import { useRevalidateModels } from "@app/lib/swr/models";
import type { ModelSelectionType } from "@app/types/assistant/models/types";
import { isAPIErrorResponse } from "@app/types/error";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback } from "react";

export function useRetryMessage({ owner }: { owner: LightWorkspaceType }) {
  const revalidateModels = useRevalidateModels(owner);

  return useCallback(
    async ({
      conversationId,
      messageId,
      blockedOnly = false,
      modelSelection,
    }: {
      conversationId: string;
      messageId: string;
      blockedOnly?: boolean;
      modelSelection?: ModelSelectionType;
    }): Promise<Result<void, WorkspaceLimit>> => {
      const res = await clientFetch(
        `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${messageId}/retry?blocked_only=${blockedOnly}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ modelSelection }),
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
      } else {
        await revalidateModels();
      }
      return new Ok(undefined);
    },
    [owner.sId, revalidateModels]
  );
}
