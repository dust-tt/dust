import { useCallback, useMemo, useState } from "react";
import type { Fetcher } from "swr";

import { useSendNotification } from "@app/hooks/useNotification";
import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetWebhookRequestsResponseBody } from "@app/pages/api/w/[wId]/assistant/agent_configurations/[aId]/triggers/[tId]/webhook_requests";
import type { GetWebhookSourceViewsResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/webhook_source_views";
import type { GetWebhookSourcesResponseBody } from "@app/pages/api/w/[wId]/webhook_sources";
import type { DeleteWebhookSourceResponseBody } from "@app/pages/api/w/[wId]/webhook_sources/[webhookSourceId]";
import type { GetWebhookSourceViewsResponseBody as GetSpecificWebhookSourceViewsResponseBody } from "@app/pages/api/w/[wId]/webhook_sources/[webhookSourceId]/views";
import type { LightWorkspaceType, SpaceType } from "@app/types";
import type {
  PostWebhookSourcesBody,
  WebhookSourceType,
  WebhookSourceViewType,
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

      const result = await response.json();
      return result.webhookSource;
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

export function useUpdateWebhookSourceView({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const sendNotification = useSendNotification();

  const updateWebhookSourceView = useCallback(
    async (
      webhookSourceViewId: string,
      updates: { name: string; description?: string; icon?: string }
    ): Promise<boolean> => {
      try {
        const response = await fetch(
          `/api/w/${owner.sId}/webhook_sources/views/${webhookSourceViewId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify(updates),
          }
        );

        if (!response.ok) {
          throw new Error("Network response was not ok");
        }

        sendNotification({
          type: "success",
          title: "Successfully updated webhook source view",
        });

        return true;
      } catch (error) {
        sendNotification({
          type: "error",
          title: "Failed to update webhook source view",
        });
        return false;
      }
    },
    [owner.sId, sendNotification]
  );

  return { updateWebhookSourceView };
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
        const response = await fetch(
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

export function useWebhookSourceViewsByWebhookSource({
  owner,
  webhookSourceId,
  disabled,
}: {
  owner: LightWorkspaceType;
  webhookSourceId: string;
  disabled?: boolean;
}) {
  const configFetcher: Fetcher<GetSpecificWebhookSourceViewsResponseBody> =
    fetcher;
  const url = `/api/w/${owner.sId}/webhook_sources/${webhookSourceId}/views`;
  const { data, error, mutate } = useSWRWithDefaults(url, configFetcher, {
    disabled,
  });

  return {
    webhookSourceViews:
      data?.views ??
      emptyArray<GetSpecificWebhookSourceViewsResponseBody["views"][number]>(),
    isWebhookSourceViewsLoading: !error && !data && !disabled,
    isWebhookSourceViewsError: error,
    mutateWebhookSourceViews: mutate,
  };
}

export function useAddWebhookSourceViewToSpace({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const sendNotification = useSendNotification();

  const { mutateWebhookSourcesWithViews } = useWebhookSourcesWithViews({
    owner,
    disabled: true,
  });

  const createView = useCallback(
    async ({
      space,
      webhookSource,
    }: {
      space: SpaceType;
      webhookSource: WebhookSourceType;
    }): Promise<void> => {
      try {
        const response = await fetch(
          `/api/w/${owner.sId}/spaces/${space.sId}/webhook_source_views`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ webhookSourceId: webhookSource.sId }),
          }
        );

        if (!response.ok) {
          const body = await response.json();
          throw new Error(body.error?.message ?? "Unknown error");
        }

        sendNotification({
          type: "success",
          title: `Webhook source added to space ${space.name}`,
          description: `${webhookSource.name} has been added to the ${space.name} space successfully.`,
        });

        await mutateWebhookSourcesWithViews();
      } catch (error) {
        sendNotification({
          type: "error",
          title: `Failed to add webhook source to space ${space.name}`,
          description: `Could not add ${webhookSource.name} to the ${space.name} space. Please try again.`,
        });
      }
    },
    [sendNotification, owner.sId, mutateWebhookSourcesWithViews]
  );

  return { addToSpace: createView };
}

export function useRemoveWebhookSourceViewFromSpace({
  owner,
}: {
  owner: LightWorkspaceType;
}) {
  const sendNotification = useSendNotification();

  const { mutateWebhookSourcesWithViews } = useWebhookSourcesWithViews({
    owner,
    disabled: true,
  });

  const deleteView = useCallback(
    async ({
      webhookSourceView,
      space,
    }: {
      webhookSourceView: WebhookSourceViewType;
      space: SpaceType;
    }): Promise<void> => {
      try {
        const response = await fetch(
          `/api/w/${owner.sId}/spaces/${space.sId}/webhook_source_views/${webhookSourceView.sId}`,
          {
            method: "DELETE",
            headers: {
              "Content-Type": "application/json",
            },
          }
        );

        if (response.ok) {
          sendNotification({
            type: "success",
            title:
              space.kind === "system"
                ? "Webhook source removed from workspace"
                : "Webhook source removed from space",
            description: `${webhookSourceView.webhookSource.name} has been removed from the ${space.name} space successfully.`,
          });

          await mutateWebhookSourcesWithViews();
        } else {
          const res = await response.json();

          // Check for foreign key constraint error specifically
          if (res.error?.type === "webhook_source_view_triggering_agent") {
            sendNotification({
              type: "error",
              title: "Webhook source in use by agents",
              description:
                "This webhook source is currently being used by existing agents. Please remove or update those agents first.",
            });
          } else {
            sendNotification({
              type: "error",
              title: "Failed to remove webhook source",
              description:
                res.error?.message ||
                `Could not remove ${webhookSourceView.webhookSource.name} from the ${space.name} space. Please try again.`,
            });
          }
        }
      } catch (error) {
        sendNotification({
          type: "error",
          title: "Failed to remove webhook source",
          description: `Could not remove ${webhookSourceView.webhookSource.name} from the ${space.name} space. Please try again.`,
        });
      }
    },
    [sendNotification, owner.sId, mutateWebhookSourcesWithViews]
  );

  return { removeFromSpace: deleteView };
}

export function useWebhookRequestTriggersForTrigger({
  owner,
  agentConfigurationId,
  triggerId,
  disabled,
}: {
  owner: LightWorkspaceType;
  agentConfigurationId: string | null;
  triggerId: string | null;
  disabled?: boolean;
}) {
  const configFetcher: Fetcher<GetWebhookRequestsResponseBody> = fetcher;

  const url =
    agentConfigurationId && triggerId
      ? `/api/w/${owner.sId}/assistant/agent_configurations/${agentConfigurationId}/triggers/${triggerId}/webhook_requests`
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
