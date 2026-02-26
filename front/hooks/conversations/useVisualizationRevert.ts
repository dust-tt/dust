import { useFetcher } from "@app/lib/swr/swr";
import datadogLogger from "@app/logger/datadogLogger";
import { useCallback } from "react";

export function useVisualizationRevert({
  workspaceId,
  conversationId,
}: {
  workspaceId: string | null;
  conversationId?: string | null;
}) {
  const { fetcherWithBody } = useFetcher();

  const handleVisualizationRevert = useCallback(
    async ({
      fileId,
      agentConfigurationId,
    }: {
      fileId: string;
      agentConfigurationId: string;
    }): Promise<boolean> => {
      try {
        await fetcherWithBody([
          `/api/w/${workspaceId}/assistant/conversations/${conversationId}/messages`,
          {
            content: `Please revert the previous change in ${fileId}`,
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
      } catch (error) {
        datadogLogger.error({ error }, "Error sending revert message");
        return false;
      }
    },
    [workspaceId, conversationId, fetcherWithBody]
  );

  return {
    handleVisualizationRevert,
  };
}
