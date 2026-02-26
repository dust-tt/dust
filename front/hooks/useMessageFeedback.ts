import { useConversationFeedbacks } from "@app/hooks/conversations";
import { useSendNotification } from "@app/hooks/useNotification";
import { useFetcher } from "@app/lib/swr/swr";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback } from "react";

export function useMessageFeedback({
  owner,
  conversationId,
}: {
  owner: LightWorkspaceType;
  conversationId?: string | null;
}) {
  const sendNotification = useSendNotification();
  const { fetcherWithBody } = useFetcher();
  const { mutateReactions } = useConversationFeedbacks({
    conversationId: conversationId ?? "",
    workspaceId: owner.sId,
    options: { disabled: true },
  });

  return useCallback(
    async ({
      messageId,
      thumbDirection,
      feedbackContent,
      isConversationShared,
      shouldRemoveExistingFeedback,
    }: {
      messageId: string;
      thumbDirection: string;
      feedbackContent: string | null;
      isConversationShared: boolean;
      shouldRemoveExistingFeedback: boolean;
    }): Promise<boolean> => {
      if (!conversationId) {
        return false;
      }

      try {
        await fetcherWithBody([
          `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${messageId}/feedbacks`,
          {
            thumbDirection,
            feedbackContent,
            isConversationShared,
          },
          shouldRemoveExistingFeedback ? "DELETE" : "POST",
        ]);

        if (feedbackContent && !shouldRemoveExistingFeedback) {
          sendNotification({
            title: "Feedback submitted",
            description:
              "Your comment has been submitted successfully to the Builder of this agent. Thank you!",
            type: "success",
          });
        }

        await mutateReactions();
        return true;
      } catch {
        return false;
      }
    },
    [
      owner.sId,
      conversationId,
      sendNotification,
      mutateReactions,
      fetcherWithBody,
    ]
  );
}
