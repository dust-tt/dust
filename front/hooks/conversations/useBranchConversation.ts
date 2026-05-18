import { useConversations } from "@app/hooks/conversations/useConversations";
import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { useAppRouter } from "@app/lib/platform";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import { getConversationRoute } from "@app/lib/utils/router";
import type { PostConversationForkResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/forks";
import type { ConversationListItemType } from "@app/types/assistant/conversation";
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
    isString(value.conversationId) &&
    (value.parentConversationTitle === null ||
      isString(value.parentConversationTitle)) &&
    (value.spaceId === null || isString(value.spaceId))
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
  const { mutateConversations } = useConversations({
    workspaceId: owner.sId,
    options: { disabled: true },
  });

  const [isBranching, setIsBranching] = useState(false);

  const branchConversation = useCallback(
    async (sourceMessageId?: string): Promise<boolean> => {
      if (!conversationId || isBranching) {
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

        const responseBody: unknown = await res.json();
        if (!isPostConversationForkResponseBody(responseBody)) {
          sendNotification({
            type: "error",
            title: "Failed to branch conversation",
            description: "Unexpected response from server.",
          });

          return false;
        }

        // Write directly into the SWR cache instead of dispatching ConversationsUpdatedEvent.
        // ConversationsUpdatedEvent triggers an immediate refetch, but ES indexes conversations
        // asynchronously via Temporal so the new conversation is not in ES yet at that point —
        // the item would disappear from the sidebar. { revalidate: false } keeps the optimistic
        // item until the next natural SWR revalidation, by which time ES has caught up.
        const displayTitle = responseBody.parentConversationTitle
          ? `Branched from '${responseBody.parentConversationTitle}'`
          : "Branched conversation";

        const nowMs = Date.now();
        const optimisticConversationItem: ConversationListItemType = {
          actionRequired: false,
          created: nowMs,
          hasError: false,
          lastReadMs: nowMs,
          metadata: {},
          nextWakeupAt: null,
          requestedSpaceIds: [],
          sId: responseBody.conversationId,
          // Inherited from the parent conversation — safe to return via the fork API
          // because the caller already has access to the parent (they just branched it).
          spaceId: responseBody.spaceId,
          title: displayTitle,
          triggerId: null,
          unread: false,
          updated: nowMs,
          isRunningAgentLoop: false,
        };

        void mutateConversations(
          (prevConversations) => {
            if (!prevConversations) {
              return prevConversations;
            }
            return [optimisticConversationItem, ...prevConversations];
          },
          { revalidate: false }
        );

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
        setIsBranching(false);
      }
    },
    [
      conversationId,
      isBranching,
      mutateConversations,
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
