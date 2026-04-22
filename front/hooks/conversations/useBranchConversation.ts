import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { ConversationsUpdatedEvent } from "@app/lib/notifications/events";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import { getConversationRoute } from "@app/lib/utils/router";
import type { PostConversationForkResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/forks";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback } from "react";

import { useConversationBranchingState } from "./useConversationBranchingState";

const BRANCHING_WINDOW_TITLE = "Opening branched conversation...";

function initializeBranchingWindow(newWindow: Window) {
  newWindow.opener = null;
  newWindow.document.write(
    `<!doctype html><html><head><title>${BRANCHING_WINDOW_TITLE}</title></head><body><p>${BRANCHING_WINDOW_TITLE}</p></body></html>`
  );
  newWindow.document.close();
}

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
  const {
    isBranching,
    startBranching,
    markBranchCreated,
    clearBranchingState,
  } = useConversationBranchingState(conversationId);

  const branchConversation = useCallback(
    async (sourceMessageId?: string): Promise<boolean> => {
      if (!conversationId || isBranching) {
        return false;
      }

      startBranching(sourceMessageId);
      const childConversationWindow =
        typeof window !== "undefined" ? window.open("", "_blank") : null;

      if (childConversationWindow) {
        initializeBranchingWindow(childConversationWindow);
      }

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
          childConversationWindow?.close();
          clearBranchingState();

          return false;
        }

        const {
          conversationId: forkedConversationId,
        }: PostConversationForkResponseBody = await res.json();

        markBranchCreated();
        window.dispatchEvent(new ConversationsUpdatedEvent());
        void onConversationBranched?.();

        const forkedConversationRoute = getConversationRoute(
          owner.sId,
          forkedConversationId
        );

        if (childConversationWindow) {
          childConversationWindow.location.assign(forkedConversationRoute);
        } else {
          window.open(forkedConversationRoute, "_blank");
        }

        return true;
      } catch {
        childConversationWindow?.close();
        clearBranchingState();
        sendNotification({
          type: "error",
          title: "Failed to branch conversation",
        });

        return false;
      }
    },
    [
      clearBranchingState,
      conversationId,
      isBranching,
      markBranchCreated,
      onConversationBranched,
      owner.sId,
      sendNotification,
      startBranching,
    ]
  );

  return {
    branchConversation,
    isBranching,
  };
}
