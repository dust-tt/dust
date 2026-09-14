import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import type { GetWebhookSourceViewsListResponseBody } from "@app/lib/resources/webhook_sources_view_resource";
import {
  emptyArray,
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { GetWebhookRequestsResponseBody } from "@app/lib/triggers/webhook";
import type {
  DeleteWebhookSourceResponseBody,
  GetWebhookSourcesResponseBody,
  GetWebhookSourceViewsResponseBody,
  PostWebhookSourcesBody,
} from "@app/types/api/webhook_source";
import type { SpaceType } from "@app/types/space";
import type {
  WebhookSourceForAdminType,
  WebhookSourceViewType,
} from "@app/types/triggers/webhooks";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useMemo, useState } from "react";
import type { Fetcher } from "swr";

export function useWebhookSourceViews({
  owner,
  space,
  disabled,
}: {
  owner: LightWorkspaceType;
  space?: SpaceType;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const configFetcher: Fetcher<GetWebhookSourceViewsResponseBody> = fetcher;
  const url =
    space !== undefined
      ? `/api/w/${owner.sId}/spaces/${space.sId}/webhook_source_views`
      : null;
  const { data, error, mutate } = useSWRWithDefaults(url, configFetcher, {
    disabled,
  });
  const webhookSourceViews = useMemo(
    () =>
      data?.webhookSourceViews ??
      emptyArray<
        GetWebhookSourceViewsResponseBody["webhookSourceViews"][number]
      >(),
    [data]
  );

  return {
    webhookSourceViews,
    isWebhookSourceViewsLoading: !error && !data && !disabled,
    isWebhookSourceViewsError: error,
    mutateWebhookSourceViews: mutate,
  };
}

export function useWebhookSourceViewsFromSpaces(
  owner: LightWorkspaceType,
  spaces: SpaceType[],
  disabled?: boolean
) {
  const { fetcher } = useFetcher();
  const configFetcher: Fetcher<GetWebhookSourceViewsListResponseBody> = fetcher;

  const spaceIds = spaces.map((s) => s.sId).join(",");

  const url = `/api/w/${owner.sId}/webhook_sources/views?spaceIds=${spaceIds}`;
  const { data, error, mutate } = useSWRWithDefaults(url, configFetcher, {
    disabled,
  });

  return {
    webhookSourceViews:
      data?.webhookSourceViews ?? emptyArray<WebhookSourceViewType>(),
    isLoading: !error && !data && spaces.length !== 0,
    isError: error,
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
  const { fetcher } = useFetcher();
  const configFetcher: Fetcher<GetWebhookSourcesResponseBody> = fetcher;

  const url = `/api/w/${owner.sId}/webhook_sources`;

  const { data, error, mutateRegardlessOfQueryParams } = useSWRWithDefaults(
    url,
    configFetcher,
    {
      disabled,
    }
  );

  const webhookSourcesWithViews =
    data?.webhookSourcesWithViews ??
    emptyArray<
      GetWebhookSourcesResponseBody["webhookSourcesWithViews"][number]
    >();

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
  ): Promise<WebhookSourceForAdminType | null> => {
    const response = await clientFetch(`/api/w/${owner.sId}/webhook_sources`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      const errorData = await getErrorFromResponse(response);

      sendNotification({
        type: "error",
        title: `Failed to create webhook source`,
        description: `Error: ${errorData.message}`,
      });
      return null;
    }

    sendNotification({
      type: "success",
      title: "Successfully created webhook source",
    });

    void mutateWebhookSourcesWithViews();

    const result = await response.json();
    return result.webhookSource;
  };

  return createWebhookSource;
}

export function useDeleteWebhookSource({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const [isDeleting, setIsDeleting] = useState(false);
  const { mutateWebhookSourcesWithViews } = useWebhookSourcesWithViews({
    disabled: true,
    owner,
  });

  const sendNotification = useSendNotification();

  const deleteWebhookSource = useCallback(
    async (webhookSourceId: string): Promise<boolean> => {
      if (isDeleting) {
        return false;
      }

      setIsDeleting(true);

      try {
        const response = await clientFetch(
          `/api/w/${owner.sId}/webhook_sources/${webhookSourceId}`,
          {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        if (!response.ok) {
          throw new Error("Network response was not ok");
        }

        const result: DeleteWebhookSourceResponseBody = await response.json();

        if (result.success) {
          sendNotification({
            type: "success",
            title: "Successfully deleted webhook source",
          });

          void mutateWebhookSourcesWithViews();
          return true;
        } else {
          throw new Error("Delete operation failed");
        }
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        // biome-ignore lint/correctness/noUnusedVariables: ignored using `--suppress`
      } catch (error) {
        sendNotification({
          type: "error",
          title: "Failed to delete webhook source",
        });
        return false;
      } finally {
        setIsDeleting(false);
      }
    },
    [owner.sId, isDeleting, mutateWebhookSourcesWithViews, sendNotification]
  );

  return {
    deleteWebhookSource,
    isDeleting,
  };
}

export function useWebhookRequestTriggersForTrigger({
  owner,
  triggerId,
  disabled,
}: {
  owner: LightWorkspaceType;
  triggerId: string | null;
  disabled?: boolean;
}) {
  const { fetcher } = useFetcher();
  const configFetcher: Fetcher<GetWebhookRequestsResponseBody> = fetcher;

  const url = triggerId
    ? `/api/w/${owner.sId}/triggers/${triggerId}/webhook_requests`
    : null;

  const { data, error, mutate } = useSWRWithDefaults(url, configFetcher, {
    disabled,
  });

  return {
    webhookRequests:
      data?.requests ??
      emptyArray<GetWebhookRequestsResponseBody["requests"][number]>(),
    isWebhookRequestsLoading: !error && !data && !disabled,
    isWebhookRequestsError: error,
    mutateWebhookRequests: mutate,
  };
}
