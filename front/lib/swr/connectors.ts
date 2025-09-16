import { useMemo, useState } from "react";
import type { Fetcher } from "swr";

import { useSendNotification } from "@app/hooks/useNotification";
import {
  fetcher,
  getErrorFromResponse,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import { useFeatureFlags } from "@app/lib/swr/workspaces";
import type { GetConnectorResponseBody } from "@app/pages/api/w/[wId]/data_sources/[dsId]/connector";
import type { GetOrPostManagedDataSourceConfigResponseBody } from "@app/pages/api/w/[wId]/data_sources/[dsId]/managed/config/[key]";
import type { GetDataSourcePermissionsResponseBody } from "@app/pages/api/w/[wId]/data_sources/[dsId]/managed/permissions";
import type {
  APIError,
  ConnectorPermission,
  ContentNode,
  ContentNodesViewType,
  DataSourceType,
  LightWorkspaceType,
} from "@app/types";

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
  const { featureFlags } = useFeatureFlags({
    workspaceId: owner.sId,
  });
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

export function useConnector({
  workspaceId,
  dataSource,
  disabled,
}: {
  workspaceId: string;
  dataSource: DataSourceType;
  disabled?: boolean;
}) {
  const configFetcher: Fetcher<GetConnectorResponseBody> = fetcher;

  const url = `/api/w/${workspaceId}/data_sources/${dataSource.sId}/connector`;

  const { data, error, mutate } = useSWRWithDefaults(url, configFetcher, {
    refreshInterval: (connectorResBody) => {
      if (connectorResBody?.connector.errorType !== undefined) {
        // We have an error, no need to auto refresh.
        return 0;
      }

      // Relying on absolute time difference here because we are comparing
      // two non synchronized clocks (front and back). It's obviously not perfect
      // but it's good enough for our use case.
      if (
        connectorResBody &&
        Math.abs(new Date().getTime() - connectorResBody.connector.updatedAt) <
          60 * 5 * 1000
      ) {
        // Connector object has been updated less than 5 minutes ago, we'll refresh every 3 seconds.
        return 3000;
      }

      return 0;
    },
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    disabled: disabled || !dataSource.connectorId,
  });

  return {
    connector: data ? data.connector : null,
    isConnectorLoading: !error && !data,
    isConnectorError: error,
    mutateConnector: mutate,
  };
}

export function useToggleSlackChatBot({
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
    disabled: true, // Needed just to mutate
  });

  if (!dataSource) {
    return () => {
      sendNotification({
        type: "error",
        title: "Failed to Enable Slack Bot",
        description: "Tried to enable Slack Bot, but no data source was found.",
      });
    };
  }

  const doToggle = async (botEnabled: boolean) => {
    const res = await fetch(
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
          ? "Slack Bot Enabled Successfully"
          : "Slack Bot Disabled Successfully",
        description: botEnabled
          ? "The Slack bot is now active and ready to use."
          : "The Slack bot has been disabled.",
      });
      return configValue;
    } else {
      const errorData = await getErrorFromResponse(res);

      sendNotification({
        type: "error",
        title: "Failed to Enable Slack Bot",
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
    const res = await fetch(
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
