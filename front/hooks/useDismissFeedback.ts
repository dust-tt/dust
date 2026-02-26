import { useSendNotification } from "@app/hooks/useNotification";
import { useFetcher } from "@app/lib/swr/swr";
import { useCallback, useState } from "react";

export function useDismissFeedback({
  workspaceId,
  agentConfigurationId,
  feedbackId,
  onSuccess,
}: {
  workspaceId: string;
  agentConfigurationId: string;
  feedbackId: string;
  onSuccess?: () => void;
}) {
  const [isDismissing, setIsDismissing] = useState(false);
  const sendNotification = useSendNotification();
  const { fetcherWithBody } = useFetcher();

  const toggleDismiss = useCallback(
    async (dismissed: boolean) => {
      setIsDismissing(true);

      try {
        await fetcherWithBody([
          `/api/w/${workspaceId}/assistant/agent_configurations/${agentConfigurationId}/feedbacks/${feedbackId}`,
          { dismissed },
          "PATCH",
        ]);
      } catch {
        sendNotification({
          type: "error",
          title: `Failed to mark feedback as ${dismissed ? "seen" : "unseen"}.`,
          description: `An error occurred while marking feedback as ${dismissed ? "seen" : "unseen"}`,
        });
        setIsDismissing(false);
        return;
      }

      sendNotification({
        type: "success",
        title: `Feedback marked as ${dismissed ? "seen" : "unseen"}.`,
        description: `The feedback has been marked as ${dismissed ? "seen" : "unseen"}.`,
      });

      if (onSuccess) {
        onSuccess();
      }
    },
    [
      workspaceId,
      agentConfigurationId,
      feedbackId,
      sendNotification,
      onSuccess,
      fetcherWithBody,
    ]
  );

  return {
    isDismissing,
    toggleDismiss,
  };
}
