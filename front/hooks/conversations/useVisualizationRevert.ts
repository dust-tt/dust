import { clientFetch } from "@app/lib/egress/client";
import { getLocalTimeZone } from "@app/lib/i18n/format";
import datadogLogger from "@app/logger/datadogLogger";
import { useLingui } from "@lingui/react/macro";
import { useCallback } from "react";

export function useVisualizationRevert({
  workspaceId,
  conversationId,
}: {
  workspaceId: string | null;
  conversationId?: string | null;
}) {
  const { t } = useLingui();

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
              content: t`Please revert the previous change in ${fileId}`,
              mentions: [
                {
                  configurationId: agentConfigurationId,
                },
              ],
              context: {
                timezone: getLocalTimeZone(),
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
    [workspaceId, conversationId, t]
  );

  return {
    handleVisualizationRevert,
  };
}
