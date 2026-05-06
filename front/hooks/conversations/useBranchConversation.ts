import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { useAppRouter } from "@app/lib/platform";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import { getConversationRoute } from "@app/lib/utils/router";
import type { PostConversationForkResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/forks";
import { isRecord, isString } from "@app/types/shared/utils/general";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useSyncExternalStore } from "react";

const branchingConversationIds = new Set<string>();
const branchingStoreListeners = new Set<() => void>();

function subscribeToBranchingStore(listener: () => void) {
  branchingStoreListeners.add(listener);

  return () => {
    branchingStoreListeners.delete(listener);
  };
}

function emitBranchingStoreUpdate() {
  for (const listener of branchingStoreListeners) {
    listener();
  }
}

function isConversationBranching(conversationId?: string | null) {
  return conversationId ? branchingConversationIds.has(conversationId) : false;
}

function setConversationBranching(conversationId: string, branching: boolean) {
  if (branching) {
    branchingConversationIds.add(conversationId);
  } else {
    branchingConversationIds.delete(conversationId);
  }

  emitBranchingStoreUpdate();
}

function isPostConversationForkResponseBody(
  value: unknown
): value is PostConversationForkResponseBody {
  return (
    typeof value === "object" &&
    value !== null &&
    isRecord(value) &&
    isString(value.conversationId)
  );
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
  const router = useAppRouter();

  const isBranching = useSyncExternalStore(
    subscribeToBranchingStore,
    () => isConversationBranching(conversationId),
    () => false
  );

  const branchConversation = useCallback(
    async (sourceMessageId?: string): Promise<boolean> => {
      if (!conversationId || isConversationBranching(conversationId)) {
        return false;
      }

      setConversationBranching(conversationId, true);

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

        const responseBody: unknown = await res.json();
        if (!isPostConversationForkResponseBody(responseBody)) {
          sendNotification({
            type: "error",
            title: "Failed to branch conversation",
            description: "Unexpected response from server.",
          });

          return false;
        }

        void onConversationBranched?.();
        await router.push(
          getConversationRoute(owner.sId, responseBody.conversationId)
        );

        return true;
      } catch {
        sendNotification({
          type: "error",
          title: "Failed to branch conversation",
        });

        return false;
      } finally {
        setConversationBranching(conversationId, false);
      }
    },
    [
      conversationId,
      onConversationBranched,
      owner.sId,
      router,
      sendNotification,
    ]
  );

  return {
    branchConversation,
    isBranching,
  };
}
