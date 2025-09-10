import { useMemo } from "react";
import type { Fetcher } from "swr";

import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetWebhookSourceViewsResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/webhook_source_views";
import type { GetWebhookSourcesResponseBody } from "@app/pages/api/w/[wId]/webhook_sources";
import type { LightWorkspaceType, SpaceType } from "@app/types";

export function useWebhookSourceViews({
  owner,
  space,
  disabled,
}: {
  owner: LightWorkspaceType;
  space?: SpaceType;
  disabled?: boolean;
}) {
  const configFetcher: Fetcher<GetWebhookSourceViewsResponseBody> = fetcher;
  const url = getWebhookSourceViewsKey(owner, space);
  const { data, error, mutate } = useSWRWithDefaults(url, configFetcher, {
    disabled,
  });
  const webhookSourceViews = useMemo(
    () => data?.webhookSourceViews ?? [],
    [data]
  );

  return {
    webhookSourceViews,
    isWebhookSourceViewsLoading: !error && !data && !disabled,
    isWebhookSourceViewsError: error,
    mutateWebhookSourceViews: mutate,
  };
}

function getWebhookSourceViewsKey(
  owner: LightWorkspaceType,
  space?: SpaceType
) {
  return space !== undefined
    ? `/api/w/${owner.sId}/spaces/${space.sId}/webhook_source_views`
    : null;
}
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
