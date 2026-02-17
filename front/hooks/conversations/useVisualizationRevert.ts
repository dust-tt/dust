import { clientFetch } from "@app/lib/egress/client";
import datadogLogger from "@app/logger/datadogLogger";
import { useCallback } from "react";

export function useVisualizationRevert({
  workspaceId,
  conversationId,
}: {
  workspaceId: string | null;
  conversationId?: string | null;
}) {
  const handleVisualizationRevert = useCallback(
    async ({
      fileId,
      agentConfigurationId,
    }: {
      fileId: string;
      agentConfigurationId: string;
    }): Promise<boolean> => {
      try {
        const response = await clientFetch(
          `/api/w/${workspaceId}/assistant/conversations/${conversationId}/messages`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
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
            }),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to send revert message");
        }

        return true;
      } catch (error) {
        datadogLogger.error({ error }, "Error sending revert message");
        return false;
      }
    },
    [workspaceId, conversationId]
  );

  return {
    handleVisualizationRevert,
  };
}
