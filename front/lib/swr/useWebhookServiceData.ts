import { useCallback, useState } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import type { LightWorkspaceType } from "@app/types";
import type { WebhookSourceKind } from "@app/types/triggers/webhooks";

export function useWebhookServiceData(
  owner: LightWorkspaceType | null,
  kind: WebhookSourceKind
) {
  const sendNotification = useSendNotification();
  const [serviceData, setServiceData] = useState<Record<string, any> | null>(
    null
  );
  const [isFetchingServiceData, setIsFetchingServiceData] = useState(false);

  const fetchServiceData = useCallback(
    async (connectionId: string) => {
      if (!owner) {
        return;
      }

      setIsFetchingServiceData(true);
      try {
        const response = await fetch(
          `/api/w/${owner.sId}/webhook_sources/service-data?connectionId=${connectionId}&kind=${kind}`
        );

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(
            errorData.error?.message || "Failed to fetch service data"
          );
        }

        const data = await response.json();
        setServiceData(data.serviceData || null);
      } catch (error) {
        sendNotification({
          type: "error",
          title: "Failed to fetch service data",
          description: error instanceof Error ? error.message : "Unknown error",
        });
        setServiceData(null);
      } finally {
        setIsFetchingServiceData(false);
      }
    },
    [owner, kind, sendNotification]
  );

  return {
    serviceData,
    isFetchingServiceData,
    fetchServiceData,
  };
}
