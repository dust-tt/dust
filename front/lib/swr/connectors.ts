import { useSendNotification } from "@app/hooks/useNotification";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { clientFetch } from "@app/lib/egress/client";
import {
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { GetOrPostManagedDataSourceConfigResponseBody } from "@app/pages/api/w/[wId]/data_sources/[dsId]/managed/config/[key]";
import type { GetDataSourcePermissionsResponseBody } from "@app/pages/api/w/[wId]/data_sources/[dsId]/managed/permissions";
import type {
  ConnectorPermission,
  ContentNode,
} from "@app/types/connectors/connectors_api";
import type { ContentNodesViewType } from "@app/types/connectors/content_nodes";
import type { DataSourceType } from "@app/types/data_source";
import type { APIError } from "@app/types/error";
import type { LightWorkspaceType } from "@app/types/user";
import { useMemo, useState } from "react";
import type { Fetcher } from "swr";

interface UseConnectorPermissionsReturn<T extends ConnectorPermission | null> {
  resources: T extends ConnectorPermission
    ? GetDataSourcePermissionsResponseBody<T>["resources"]
    : ContentNode[];
  isResourcesLoading: boolean;
  isResourcesError: boolean;
  resourcesError: APIError | null;
}

export function useConnectorPermissions<T extends ConnectorPermission | null>({
  owner,
  dataSource,
  parentId,
  filterPermission,
  disabled,
  viewType,
}: {
  owner: LightWorkspaceType;
  dataSource: DataSourceType;
  parentId: string | null;
  filterPermission: T;
  disabled?: boolean;
  viewType?: ContentNodesViewType;
}): UseConnectorPermissionsReturn<T> {
  const { fetcher } = useFetcher();
  const { featureFlags } = useFeatureFlags();
  const permissionsFetcher: Fetcher<
    T extends ConnectorPermission
      ? GetDataSourcePermissionsResponseBody<T>
      : GetDataSourcePermissionsResponseBody
  > = fetcher;

  let url = `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/permissions?viewType=${viewType}`;
  if (parentId) {
    url += `&parentId=${parentId}`;
  }
  if (filterPermission) {
    url += `&filterPermission=${filterPermission}`;
  }

  const { data, error } = useSWRWithDefaults(url, permissionsFetcher, {
    disabled,
  });

  return {
    resources: useMemo(
      () =>
        data
          ? data.resources.filter(
              (resource) =>
                resource.providerVisibility !== "private" ||
                featureFlags.includes("index_private_slack_channel")
            )
          : [],
      [data, featureFlags]
    ),
    isResourcesLoading: !error && !data,
    isResourcesError: error,
    resourcesError: error ? (error.error as APIError) : null,
  } as UseConnectorPermissionsReturn<T>;
}

export function useConnectorConfig({
  configKey,
  dataSource,
  disabled,
  owner,
}: {
  configKey: string;
  dataSource: DataSourceType | null;
  disabled?: boolean;
  owner: LightWorkspaceType;
}) {
  const { fetcher } = useFetcher();
  const configFetcher: Fetcher<GetOrPostManagedDataSourceConfigResponseBody> =
    fetcher;

  const url = `/api/w/${owner.sId}/data_sources/${dataSource?.sId}/managed/config/${configKey}`;

  const { data, error, mutate } = useSWRWithDefaults(url, configFetcher, {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    disabled: disabled || !dataSource,
  });

  return {
    configValue: data ? data.configValue : null,
    isResourcesLoading: !error && !data,
    isResourcesError: error,
    mutateConfig: mutate,
  };
}

export function useOAuthMetadata({
  dataSource,
  disabled,
  owner,
}: {
  dataSource: DataSourceType | null;
  disabled?: boolean;
  owner: LightWorkspaceType;
}) {
  const { fetcher } = useFetcher();
  const metadataFetcher: Fetcher<{ metadata: Record<string, unknown> }> =
    fetcher;

  const url = `/api/w/${owner.sId}/data_sources/${dataSource?.sId}/managed/oauth-metadata`;

  const { data, error } = useSWRWithDefaults(url, metadataFetcher, {
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    disabled: disabled || !dataSource,
  });

  return {
    metadata: data ? data.metadata : null,
    isMetadataLoading: !error && !data,
    isMetadataError: error,
  };
}

export function useToggleChatBot({
  dataSource,
  owner,
  botName,
}: {
  dataSource: DataSourceType | null;
  owner: LightWorkspaceType;
  botName: string;
}) {
  const sendNotification = useSendNotification();

  const { mutateConfig } = useConnectorConfig({
    owner,
    dataSource,
    configKey: "botEnabled",
    disabled: true, // Needed just to mutate
  });

  if (!dataSource) {
    return () => {
      sendNotification({
        type: "error",
        title: `Failed to Enable ${botName}`,
        description: `Tried to enable ${botName}, but no data source was found.`,
      });
    };
  }

  const doToggle = async (botEnabled: boolean) => {
    const res = await clientFetch(
      `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/config/botEnabled`,
      {
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
        body: JSON.stringify({ configValue: botEnabled.toString() }),
      }
    );

    if (res.ok) {
      void mutateConfig();

      const response: GetOrPostManagedDataSourceConfigResponseBody =
        await res.json();

      const { configValue } = response;

      sendNotification({
        type: "success",
        title: botEnabled
          ? `${botName} Enabled Successfully`
          : `${botName} Disabled Successfully`,
        description: botEnabled
          ? `The ${botName} is now active and ready to use.`
          : `The ${botName} has been disabled.`,
      });
      return configValue;
    } else {
      const errorData = await getErrorFromResponse(res);

      sendNotification({
        type: "error",
        title: `Failed to Enable ${botName}`,
        description: errorData.message,
      });
      return null;
    }
  };

  return doToggle;
}

export function useToggleDiscordChatBot({
  dataSource,
  owner,
}: {
  dataSource: DataSourceType | null;
  owner: LightWorkspaceType;
}) {
  const sendNotification = useSendNotification();

  const { mutateConfig } = useConnectorConfig({
    owner,
    dataSource,
    configKey: "botEnabled",
    disabled: true,
  });

  if (!dataSource) {
    return () => {
      sendNotification({
        type: "error",
        title: "Failed to Enable Discord Bot",
        description:
          "Tried to enable Discord Bot, but no data source was found.",
      });
    };
  }

  const doToggle = async (botEnabled: boolean) => {
    const res = await clientFetch(
      `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/config/botEnabled`,
      {
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
        body: JSON.stringify({ configValue: botEnabled.toString() }),
      }
    );

    if (res.ok) {
      void mutateConfig();

      const response: GetOrPostManagedDataSourceConfigResponseBody =
        await res.json();

      const { configValue } = response;

      sendNotification({
        type: "success",
        title: botEnabled
          ? "Discord Bot Enabled Successfully"
          : "Discord Bot Disabled Successfully",
        description: botEnabled
          ? "The Discord bot is now active and ready to use."
          : "The Discord bot has been disabled.",
      });
      return configValue;
    } else {
      const errorData = await getErrorFromResponse(res);

      sendNotification({
        type: "error",
        title: "Failed to Enable Discord Bot",
        description: errorData.message,
      });
      return null;
    }
  };

  return doToggle;
}

export function useTogglePdfEnabled({
  dataSource,
  owner,
}: {
  dataSource: DataSourceType | null;
  owner: LightWorkspaceType;
}) {
  const sendNotification = useSendNotification();
  const [isLoading, setIsLoading] = useState(false);

  const { mutateConfig } = useConnectorConfig({
    owner,
    dataSource,
    configKey: "pdfEnabled",
    disabled: true, // Needed just to mutate
  });

  if (!dataSource) {
    return {
      doToggle: () => {
        sendNotification({
          type: "error",
          title: "Failed to update PDF sync setting",
          description:
            "Tried to update PDF sync setting, but no data source was found.",
        });
      },
      isLoading: false,
    };
  }

  const doToggle = async (pdfEnabled: boolean) => {
    setIsLoading(true);
    const res = await clientFetch(
      `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/config/pdfEnabled`,
      {
        headers: {
          "Content-Type": "application/json",
        },
        method: "POST",
        body: JSON.stringify({ configValue: pdfEnabled.toString() }),
      }
    );

    if (res.ok) {
      void mutateConfig();

      const response: GetOrPostManagedDataSourceConfigResponseBody =
        await res.json();

      const { configValue } = response;

      sendNotification({
        type: "success",
        title: "PDF sync setting updated successfully",
        description: pdfEnabled
          ? "PDF syncing is now enabled."
          : "PDF syncing has been disabled.",
      });
      setIsLoading(false);
      return configValue;
    } else {
      const errorData = await getErrorFromResponse(res);

      sendNotification({
        type: "error",
        title: "Failed to update PDF sync setting",
        description: errorData.message,
      });
      setIsLoading(false);
      return null;
    }
  };

  return { doToggle, isLoading };
}
