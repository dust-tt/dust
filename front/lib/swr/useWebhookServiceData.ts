import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetServiceDataResponseType } from "@app/pages/api/w/[wId]/webhook_sources/service-data";
import type { LightWorkspaceType } from "@app/types";
import type { WebhookProvider } from "@app/types/triggers/webhooks";

export function useWebhookServiceData<P extends WebhookProvider>({
  owner,
  connectionId,
  provider,
}: {
  owner: LightWorkspaceType;
  connectionId: string | null;
  provider: P;
}) {
  const { data, error, mutate } = useSWRWithDefaults<
    string,
    GetServiceDataResponseType<P>
  >(
    `/api/w/${owner.sId}/webhook_sources/service-data?connectionId=${connectionId}&provider=${provider}`,
    fetcher,
    {
      disabled: !connectionId,
    }
  );

  return {
    serviceData: data?.serviceData ?? null,
    isServiceDataLoading: !error && !data && connectionId,
    isServiceDataError: !!error,
    mutateServiceData: mutate,
  };
}
