import { useMemo } from "react";
import type { Fetcher } from "swr";

import { useSendNotification } from "@app/hooks/useNotification";
import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetWebhookSourceViewsResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/webhook_source_views";
import type { GetWebhookSourcesResponseBody } from "@app/pages/api/w/[wId]/webhook_sources";
import type { LightWorkspaceType, SpaceType } from "@app/types";
import type {
  PostWebhookSourcesBody,
  WebhookSourceType,
} from "@app/types/triggers/webhooks";

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
  const url =
    space !== undefined
      ? `/api/w/${owner.sId}/spaces/${space.sId}/webhook_source_views`
      : null;
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

export function useCreateWebhookSource({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const { mutateWebhookSourcesWithViews } = useWebhookSourcesWithViews({
    disabled: true,
    owner,
  });

  const sendNotification = useSendNotification();
  const createWebhookSource = async (
    input: PostWebhookSourcesBody
  ): Promise<WebhookSourceType | null> => {
    try {
      const response = await fetch(`/api/w/${owner.sId}/webhook_sources`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(input),
      });

      if (!response.ok) {
        throw new Error("Network response was not ok");
      }

      sendNotification({
        type: "success",
        title: `Successfully created webhook source`,
      });

      void mutateWebhookSourcesWithViews();

      return await response.json();
    } catch (error) {
      sendNotification({
        type: "error",
        title: `Failed to create webhook source`,
      });

      return null;
    }
  };

  return createWebhookSource;
}
