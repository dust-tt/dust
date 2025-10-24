import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetServiceDataResponseType } from "@app/pages/api/w/[wId]/webhook_sources/service-data";
import type { LightWorkspaceType } from "@app/types";
import type { WebhookSourceKind } from "@app/types/triggers/webhooks";

export function useWebhookServiceData({
  owner,
  connectionId,
  kind,
}: {
  owner: LightWorkspaceType;
  connectionId: string | null;
  kind: WebhookSourceKind;
}) {
  const serviceDataFetcher: Fetcher<GetServiceDataResponseType> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/webhook_sources/service-data?connectionId=${connectionId}&kind=${kind}`,
    serviceDataFetcher,
    {
      disabled: !connectionId,
    }
  );

  return {
    serviceData: data?.serviceData ?? null,
    isServiceDataLoading: !error && !data && connectionId,
    isTagsError: !!error,
    mutateServiceData: mutate,
  };
}
