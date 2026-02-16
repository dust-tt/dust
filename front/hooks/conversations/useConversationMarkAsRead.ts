import { clientFetch } from "@app/lib/egress/client";
import logger from "@app/logger/logger";
import type { GetConversationsResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations";
import type { PatchConversationsRequestBody } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { isProjectConversation } from "@app/types/assistant/conversation";
import { useCallback, useEffect } from "react";
import { useConversations } from "./useConversations";
import { useSpaceConversationsSummary } from "./useSpaceConversations";

const DELAY_BEFORE_MARKING_AS_READ = 2000;

export function useConversationMarkAsRead({
  conversation,
  workspaceId,
}: {
  conversation?: ConversationWithoutContentType;
  workspaceId: string;
}) {
  const { mutateConversations } = useConversations({ workspaceId });

  const { mutate: mutateSpaceSummary } = useSpaceConversationsSummary({
    workspaceId,
    options: {
      disabled: true,
    },
  });

  const markAsRead = useCallback(
    async (
      conversationId: string,
      options?: {
        mutateList?: boolean;
        mutateSpaceConversationsSummary?: boolean;
      }
    ): Promise<void> => {
      try {
        const response = await clientFetch(
          `/api/w/${workspaceId}/assistant/conversations/${conversationId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              read: true,
            } satisfies PatchConversationsRequestBody),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to mark conversation as read");
        }
        if (options?.mutateList) {
          void mutateConversations(
            (prevState: GetConversationsResponseBody | undefined) =>
              prevState
                ? {
                    conversations: prevState.conversations.map((c) =>
                      c.sId === conversationId ? { ...c, unread: false } : c
                    ),
                  }
                : undefined,
            { revalidate: false }
          );
        }
        if (options?.mutateSpaceConversationsSummary) {
          void mutateSpaceSummary((prevState) => {
            if (!prevState) {
              return prevState;
            }
            return {
              ...prevState,
              summary: prevState.summary.map((spaceSummary) => {
                if (spaceSummary.space.sId === conversation?.spaceId) {
                  return {
                    ...spaceSummary,
                    unreadConversations:
                      spaceSummary.unreadConversations.filter(
                        ({ sId }) => sId !== conversationId
                      ) ?? [],
                    nonParticipantUnreadConversations:
                      spaceSummary.nonParticipantUnreadConversations.filter(
                        ({ sId }) => sId !== conversationId
                      ) ?? [],
                  };
                }
                return spaceSummary;
              }),
            };
          });
        }
      } catch (error) {
        logger.error({ err: error }, "Error marking conversation as read:");
      }
    },
    [
      workspaceId,
      mutateConversations,
      mutateSpaceSummary,
      conversation?.spaceId,
    ]
  );

  useEffect(() => {
    let timeout: NodeJS.Timeout | null = null;
    if (conversation?.sId && conversation?.unread) {
      timeout = setTimeout(
        () =>
          markAsRead(conversation.sId, {
            mutateList: !isProjectConversation(conversation),
            mutateSpaceConversationsSummary:
              isProjectConversation(conversation),
          }),
        DELAY_BEFORE_MARKING_AS_READ
      );
    }

    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [markAsRead, conversation]);

  return {
    markAsRead,
  };
}
