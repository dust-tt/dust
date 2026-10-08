import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { useLingui } from "@lingui/react/macro";
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
  const { t } = useLingui();
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
          title: dismissed
            ? t`Failed to mark feedback as seen.`
            : t`Failed to mark feedback as unseen.`,
          description: dismissed
            ? t`An error occurred while marking feedback as seen.`
            : t`An error occurred while marking feedback as unseen.`,
        });
        setIsDismissing(false);
        return;
      }

      sendNotification({
        type: "success",
        title: dismissed
          ? t`Feedback marked as seen.`
          : t`Feedback marked as unseen.`,
        description: dismissed
          ? t`The feedback has been marked as seen.`
          : t`The feedback has been marked as unseen.`,
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
      t,
    ]
  );

  return {
    isDismissing,
    toggleDismiss,
  };
}
