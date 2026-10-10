import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import type { LightWorkspaceType } from "@app/types/user";
import { useLingui } from "@lingui/react/macro";
import { useCallback } from "react";

export function useCancelMessage({
  owner,
  conversationId,
}: {
  owner: LightWorkspaceType;
  conversationId?: string | null;
}) {
  const { t } = useLingui();
  const sendNotification = useSendNotification();

  return useCallback(
    async (
      messageIds: string[],
      action: "cancel" | "interrupt" = "cancel"
    ): Promise<boolean> => {
      if (!conversationId || messageIds.length === 0) {
        return false;
      }
      const res = await clientFetch(
        `/api/w/${owner.sId}/assistant/conversations/${conversationId}/cancel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action,
            messageIds,
          }),
        }
      ).catch(() => null);
      if (!res?.ok) {
        sendNotification({ type: "error", title: t`Failed to cancel message` });
        return false;
      }
      return true;
    },
    [owner.sId, conversationId, sendNotification, t]
  );
}
