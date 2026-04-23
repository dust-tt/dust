import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useEffect, useState } from "react";

const CONVERSATION_BRANCHING_CURSOR_CLASSNAME =
  "conversation-branching-in-progress";

export function useBranchConversation({
  owner,
  conversationId,
  onConversationBranched,
}: {
  owner: LightWorkspaceType;
  conversationId?: string | null;
  onConversationBranched?: () => Promise<void> | void;
}) {
  const sendNotification = useSendNotification();

  const [isBranching, setIsBranching] = useState(false);

  useEffect(() => {
    if (!isBranching) {
      return;
    }

    document.body.classList.add(CONVERSATION_BRANCHING_CURSOR_CLASSNAME);

    return () => {
      document.body.classList.remove(CONVERSATION_BRANCHING_CURSOR_CLASSNAME);
    };
  }, [isBranching]);

  const branchConversation = useCallback(
    async (sourceMessageId?: string): Promise<boolean> => {
      if (!conversationId) {
        return false;
      }

      setIsBranching(true);

      try {
        const requestBody = sourceMessageId ? { sourceMessageId } : {};

        const res = await clientFetch(
          `/api/w/${owner.sId}/assistant/conversations/${conversationId}/forks`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
          }
        );

        if (!res.ok) {
          const errorData = await getErrorFromResponse(res);

          sendNotification({
            type: "error",
            title: "Failed to branch conversation",
            description: errorData.message,
          });

          return false;
        }

        await res.json();

        void onConversationBranched?.();

        return true;
      } catch {
        sendNotification({
          type: "error",
          title: "Failed to branch conversation",
        });

        return false;
      } finally {
        setIsBranching(false);
      }
    },
    [conversationId, onConversationBranched, sendNotification, owner.sId]
  );

  return {
    branchConversation,
    isBranching,
  };
}
