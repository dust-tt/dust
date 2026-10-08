import {
  useSendApiErrorNotification,
  useSendNotification,
} from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { COMPACTION_COMPLETED_EVENT } from "@app/lib/notifications/events";
import type { SupportedModel } from "@app/types/assistant/models/types";
import type { LightWorkspaceType } from "@app/types/user";
import { useLingui } from "@lingui/react/macro";
import { useCallback, useEffect, useState } from "react";

export function useCompactConversation({
  owner,
  conversationId,
}: {
  owner: LightWorkspaceType;
  conversationId?: string | null;
}) {
  const { t } = useLingui();
  const sendNotification = useSendNotification();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const [isCompacting, setIsCompacting] = useState(false);

  // Listen for the compaction_message_done SSE event (dispatched as a DOM custom event).
  useEffect(() => {
    const handler = () => {
      setIsCompacting(false);
    };
    window.addEventListener(COMPACTION_COMPLETED_EVENT, handler);
    return () => {
      window.removeEventListener(COMPACTION_COMPLETED_EVENT, handler);
    };
  }, []);

  const compact = useCallback(
    async (model: SupportedModel) => {
      if (!conversationId) {
        return;
      }
      setIsCompacting(true);
      try {
        const res = await clientFetch(
          `/api/w/${owner.sId}/assistant/conversations/${conversationId}/compactions`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model }),
          }
        );
        if (!res.ok) {
          const body = await res.json();
          sendApiErrorNotification({
            title: t`Failed to compact conversation`,
            error: body,
          });
          setIsCompacting(false);
        }
        // isCompacting stays true until the compaction_message_done event is received.
      } catch {
        sendNotification({
          type: "error",
          title: t`Failed to compact conversation`,
        });
        setIsCompacting(false);
      }
    },
    [owner.sId, conversationId, sendApiErrorNotification, sendNotification, t]
  );

  return { compact, isCompacting };
}
