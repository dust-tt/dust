import { getVisualizationRetryMessage } from "@app/lib/client/visualization";
import { clientFetch } from "@app/lib/egress/client";
import logger from "@app/logger/logger";
import { useCallback } from "react";

export function useVisualizationRetry({
  workspaceId,
  conversationId,
  agentConfigurationId,
  isPublic,
}: {
  workspaceId: string | null;
  conversationId?: string | null;
  agentConfigurationId: string | null;
  isPublic: boolean;
}) {
  const canRetry = !isPublic && agentConfigurationId && conversationId;

  const handleVisualizationRetry = useCallback(
    async (errorMessage: string): Promise<boolean> => {
      if (!canRetry) {
        return false;
      }

      try {
        const response = await clientFetch(
          `/api/w/${workspaceId}/assistant/conversations/${conversationId}/messages`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              content: getVisualizationRetryMessage(errorMessage),
              mentions: [
                {
                  configurationId: agentConfigurationId,
                },
              ],
              context: {
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                profilePictureUrl: null,
              },
            }),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to send retry message");
        }

        return true;
      } catch (err) {
        logger.error({ err }, "Error sending retry message");
        return false;
      }
    },
    [workspaceId, conversationId, agentConfigurationId, canRetry]
  );

  return {
    handleVisualizationRetry,
    canRetry,
  };
}
