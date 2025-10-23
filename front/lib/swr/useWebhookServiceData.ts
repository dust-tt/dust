import { useMemo } from "react";
import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetServiceDataResponseType } from "@app/pages/api/w/[wId]/webhook_sources/service-data";
import type { LightWorkspaceType } from "@app/types";
import type { WebhookSourceWithPresetKind } from "@app/types/triggers/webhooks";

export function useWebhookServiceData<K extends WebhookSourceWithPresetKind>({
  owner,
  kind,
  connectionId,
  disabled,
}: {
  owner: LightWorkspaceType | null;
  kind: K;
  connectionId: string | null;
  disabled?: boolean;
}): {
  serviceData: GetServiceDataResponseType<K>["serviceData"] | null;
  isServiceDataLoading: boolean;
  isServiceDataError: any;
  mutateServiceData: () => Promise<GetServiceDataResponseType<K> | undefined>;
} {
  const configFetcher: Fetcher<GetServiceDataResponseType<K>> = fetcher;

  const url =
    owner && connectionId
      ? `/api/w/${owner.sId}/webhook_sources/service-data?connectionId=${connectionId}&kind=${kind}`
      : null;

  const { data, error, mutate } = useSWRWithDefaults(url, configFetcher, {
    disabled,
  });

  const serviceData = useMemo(
    () => data?.serviceData ?? null,
    [data?.serviceData]
  ) as GetServiceDataResponseType<K>["serviceData"] | null;

  return {
    serviceData,
    isServiceDataLoading: !error && !data && !disabled && !!url,
    isServiceDataError: error,
    mutateServiceData: mutate,
  };
}
