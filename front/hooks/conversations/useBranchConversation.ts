import { useConversations } from "@app/hooks/conversations/useConversations";
import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { useAppRouter } from "@app/lib/platform";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import { getConversationRoute } from "@app/lib/utils/router";
import type { PostConversationForkResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/forks";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useState } from "react";

export function useBranchConversation({
  owner,
  conversationId,
}: {
  owner: LightWorkspaceType;
  conversationId?: string | null;
}) {
  const sendNotification = useSendNotification();
  const router = useAppRouter();
  const { mutateConversations } = useConversations({ workspaceId: owner.sId });

  const [isBranching, setIsBranching] = useState(false);

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

        const { conversation }: PostConversationForkResponseBody =
          await res.json();

        await router.push(
          getConversationRoute(owner.sId, conversation.sId),
          undefined,
          {
            shallow: true,
          }
        );

        if (!conversation.spaceId) {
          void mutateConversations(
            (
              currentConversations: ConversationWithoutContentType[] | undefined
            ) =>
              currentConversations
                ? [
                    conversation,
                    ...currentConversations.filter(
                      (currentConversation) =>
                        currentConversation.sId !== conversation.sId
                    ),
                  ]
                : currentConversations
          );
        } else {
          void mutateConversations();
        }

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
    [conversationId, mutateConversations, owner.sId, router, sendNotification]
  );

  return {
    branchConversation,
    isBranching,
  };
}
