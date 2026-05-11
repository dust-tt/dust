import { useOptionalConversationBranchingContext } from "@app/components/assistant/conversation/ConversationBranchingContext";
import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { ConversationsUpdatedEvent } from "@app/lib/notifications/events";
import { useAppRouter } from "@app/lib/platform";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import { getConversationRoute } from "@app/lib/utils/router";
import type { PostConversationForkResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/forks";
import { isRecord, isString } from "@app/types/shared/utils/general";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useState } from "react";

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
  const branchingContext = useOptionalConversationBranchingContext();
  const [localIsBranching, setLocalIsBranching] = useState(false);

  const isBranching = conversationId
    ? branchingContext
      ? branchingContext.branchingConversationIds.has(conversationId)
      : localIsBranching
    : false;

  const setBranching = useCallback(
    (branching: boolean) => {
      if (!conversationId) {
        return;
      }

      if (branchingContext) {
        branchingContext.setConversationBranching(conversationId, branching);
        return;
      }

      setLocalIsBranching(branching);
    },
    [branchingContext, conversationId]
  );

  const branchConversation = useCallback(
    async (sourceMessageId?: string): Promise<boolean> => {
      if (!conversationId || isBranching) {
        return false;
      }

      setBranching(true);

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

        window.dispatchEvent(new ConversationsUpdatedEvent());
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
        setBranching(false);
      }
    },
    [
      conversationId,
      isBranching,
      onConversationBranched,
      owner.sId,
      router,
      sendNotification,
      setBranching,
    ]
  );

  return {
    branchConversation,
    isBranching,
  };
}
