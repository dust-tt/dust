import { useDustAPI } from "@app/shared/lib/dust_api";
import { useConversations } from "@app/ui/components/conversation/useConversations";
import { datadogLogs } from "@datadog/browser-logs";
import type { ConversationPublicType } from "@dust-tt/client";
import { useCallback, useEffect } from "react";

const DELAY_BEFORE_MARKING_AS_READ = 2000;

/**
 * This hook can be used to automatically mark a conversation as read after a delay.
 * It can also be used to manually mark a conversation as read.
 */
export function useConversationMarkAsRead({
  conversation,
}: {
  conversation: ConversationPublicType | null;
}) {
  const { mutateConversations } = useConversations();
  const dustAPI = useDustAPI();

  const markAsRead = useCallback(
    async (conversationId: string, mutateList: boolean): Promise<void> => {
      const response = await dustAPI.markAsRead({
        conversationId,
      });

      if (response.isErr()) {
        datadogLogs.logger.error(
          "Error marking conversation as read:",
          response.error
        );
        throw new Error("Failed to mark conversation as read");
      }
      if (mutateList) {
        void mutateConversations();
      }
    },
    [mutateConversations]
  );

  useEffect(() => {
    let timeout: NodeJS.Timeout | null = null;
    if (conversation?.sId && conversation.unread) {
      timeout = setTimeout(
        () => markAsRead(conversation.sId, true),
        DELAY_BEFORE_MARKING_AS_READ
      );
    }

    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [conversation?.sId, conversation?.unread, markAsRead]);

  return {
    markAsRead,
  };
}
