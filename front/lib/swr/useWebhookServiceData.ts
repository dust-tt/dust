import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetServiceDataResponseType } from "@app/pages/api/w/[wId]/webhook_sources/service-data";
import type { WebhookProvider } from "@app/types/triggers/webhooks";
import type { LightWorkspaceType } from "@app/types/user";

export function useWebhookServiceData<P extends WebhookProvider>({
  owner,
  connectionId,
  provider,
}: {
  owner: LightWorkspaceType;
  connectionId: string | null;
  provider: P;
}) {
  const { fetcher } = useFetcher();
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
