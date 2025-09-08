import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetWebhookSourcesResponseBody } from "@app/pages/api/w/[wId]/webhooks_sources";
import type { Fetcher } from "swr";

export function useWebhookSources({
  workspaceId,
  disabled,
}: {
  workspaceId: string;
  disabled?: boolean;
}) {
  const webhookSourcesFetcher: Fetcher<GetWebhookSourcesResponseBody> = fetcher;

  const { data, error, mutate, isValidating } = useSWRWithDefaults(
    `/api/w/${workspaceId}/webhooks_sources`,
    webhookSourcesFetcher,
    { disabled }
  );

  return {
    webhookSources: data?.webhookSources ?? emptyArray(),
    isWebhookSourcesLoading: !error && !data && !disabled,
    isWebhookSourcesError: error,
    isWebhookSourcesValidating: isValidating,
    mutateWebhookSources: mutate,
  };
}
