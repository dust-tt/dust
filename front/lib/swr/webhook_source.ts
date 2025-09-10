import type { Fetcher } from "swr";

import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetWebhookSourcesResponseBody } from "@app/pages/api/w/[wId]/webhook_sources";
import type { LightWorkspaceType } from "@app/types";

export function useWebhookSourcesWithViews({
  owner,
  disabled,
}: {
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const configFetcher: Fetcher<GetWebhookSourcesResponseBody> = fetcher;

  const url = `/api/w/${owner.sId}/webhook_sources`;

  const { data, error, mutateRegardlessOfQueryParams } = useSWRWithDefaults(
    url,
    configFetcher,
    {
      disabled,
    }
  );

  const webhookSourcesWithViews = data?.webhookSourcesWithViews ?? emptyArray();

  return {
    webhookSourcesWithViews,
    isWebhookSourcesWithViewsLoading: !error && !data && !disabled,
    isWebhookSourcesWithViewsError: error,
    mutateWebhookSourcesWithViews: mutateRegardlessOfQueryParams,
  };
}
