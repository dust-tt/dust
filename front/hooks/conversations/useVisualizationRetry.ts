import { getVisualizationRetryMessage } from "@app/lib/client/visualization";
import { useFetcher } from "@app/lib/swr/swr";
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
  const { fetcherWithBody } = useFetcher();

  const handleVisualizationRetry = useCallback(
    async (errorMessage: string): Promise<boolean> => {
      if (!canRetry) {
        return false;
      }

      try {
        await fetcherWithBody([
          `/api/w/${workspaceId}/assistant/conversations/${conversationId}/messages`,
          {
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
          },
          "POST",
        ]);

        return true;
      } catch (err) {
        logger.error({ err }, "Error sending retry message");
        return false;
      }
    },
    [
      workspaceId,
      conversationId,
      agentConfigurationId,
      canRetry,
      fetcherWithBody,
    ]
  );

  return {
    handleVisualizationRetry,
    canRetry,
  };
}
