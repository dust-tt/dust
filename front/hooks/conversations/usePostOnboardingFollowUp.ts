import { useSendNotification } from "@app/hooks/useNotification";
import { useFetcher } from "@app/lib/swr/swr";
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
  const { fetcherWithBody } = useFetcher();

  const postFollowUp = useCallback(
    async (toolId: string): Promise<boolean> => {
      if (!conversationId) {
        return false;
      }
      try {
        await fetcherWithBody([
          `/api/w/${workspaceId}/assistant/conversations/${conversationId}/onboarding-followup`,
          { toolId },
          "POST",
        ]);

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
    [workspaceId, conversationId, sendNotification, fetcherWithBody]
  );

  return { postFollowUp };
}
