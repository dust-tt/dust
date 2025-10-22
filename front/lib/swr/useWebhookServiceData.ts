import { useCallback, useState } from "react";

import { useSendNotification } from "@app/hooks/useNotification";
import type { GetServiceDataResponseType } from "@app/pages/api/w/[wId]/webhook_sources/service-data";
import type { LightWorkspaceType } from "@app/types";
import { normalizeError } from "@app/types";
import type { WebhookSourceKind } from "@app/types/triggers/webhooks";

export function useWebhookServiceData<
  K extends Exclude<WebhookSourceKind, "custom">,
>(owner: LightWorkspaceType | null, kind: K) {
  const sendNotification = useSendNotification();
  const [serviceData, setServiceData] = useState<GetServiceDataResponseType<K>["serviceData"] | null>(
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

        const data: GetServiceDataResponseType<K> = await response.json();
        setServiceData(data.serviceData || null);
      } catch (error) {
        sendNotification({
          type: "error",
          title: "Failed to fetch service data",
          description: normalizeError(error).message,
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
