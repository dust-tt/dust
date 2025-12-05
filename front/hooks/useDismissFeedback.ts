import { useCallback, useState } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";

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

  const toggleDismiss = useCallback(
    async (dismissed: boolean) => {
      setIsDismissing(true);
      const response = await clientFetch(
        `/api/w/${workspaceId}/assistant/agent_configurations/${agentConfigurationId}/feedbacks/${feedbackId}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ dismissed }),
        }
      );

      if (!response.ok) {
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
    [workspaceId, agentConfigurationId, feedbackId, sendNotification, onSuccess]
  );

  return {
    isDismissing,
    toggleDismiss,
  };
}
