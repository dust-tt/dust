import { useCallback } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { useConversationFeedbacks } from "@app/lib/swr/conversations";
import type { LightWorkspaceType } from "@app/types";

export function useMessageFeedback({
  owner,
  conversationId,
}: {
  owner: LightWorkspaceType;
  conversationId: string | null;
}) {
  const sendNotification = useSendNotification();
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

      const response = await clientFetch(
        `/api/w/${owner.sId}/assistant/conversations/${conversationId}/messages/${messageId}/feedbacks`,
        {
          method: shouldRemoveExistingFeedback ? "DELETE" : "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            thumbDirection,
            feedbackContent,
            isConversationShared,
          }),
        }
      );

      if (response.ok) {
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
      }

      return false;
    },
    [owner.sId, conversationId, sendNotification, mutateReactions]
  );
}
