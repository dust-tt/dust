import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import datadogLogger from "@app/logger/datadogLogger";
import { useCallback } from "react";

export function usePostOnboardingFollowUp({
  workspaceId,
  conversationId,
}: {
  workspaceId: string;
  conversationId?: string | null;
}) {
  const sendNotification = useSendNotification();

  const postFollowUp = useCallback(
    async (toolId: string): Promise<boolean> => {
      if (!conversationId) {
        return false;
      }
      try {
        const response = await clientFetch(
          `/api/w/${workspaceId}/assistant/conversations/${conversationId}/onboarding-followup`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ toolId }),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to post onboarding follow-up");
        }

        return true;
      } catch (error) {
        datadogLogger.error("Error posting onboarding follow-up", {
          error,
          workspaceId,
          conversationId,
          toolId,
        });
        sendNotification({
          type: "error",
          title: "Failed to send follow-up message",
        });
        return false;
      }
    },
    [workspaceId, conversationId, sendNotification]
  );

  return { postFollowUp };
}
