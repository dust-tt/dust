import { useConversationFeedbacks } from "@app/hooks/conversations";
import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
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
        if (!shouldRemoveExistingFeedback) {
          sendNotification({
            title: "Feedback sent",
            description: "Your feedback helps improve this agent.",
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
