import type {
  ConnectorPermission,
  ContentNodesViewType,
  DataSourceType,
  LightWorkspaceType,
} from "@dust-tt/types";
import { useContext, useMemo } from "react";
import type { Fetcher } from "swr";

import { SendNotificationsContext } from "@app/components/sparkle/Notification";
import {
  fetcher,
  getErrorFromResponse,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { GetConnectorResponseBody } from "@app/pages/api/w/[wId]/data_sources/[dsId]/connector";
import type { GetOrPostManagedDataSourceConfigResponseBody } from "@app/pages/api/w/[wId]/data_sources/[dsId]/managed/config/[key]";
import type { GetDataSourcePermissionsResponseBody } from "@app/pages/api/w/[wId]/data_sources/[dsId]/managed/permissions";

export function useConnectorPermissions({
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
  filterPermission: ConnectorPermission | null;
  disabled?: boolean;
  viewType?: ContentNodesViewType;
}) {
  const permissionsFetcher: Fetcher<GetDataSourcePermissionsResponseBody> =
    fetcher;

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
    resources: useMemo(() => (data ? data.resources : []), [data]),
    isResourcesLoading: !error && !data,
    isResourcesError: error,
  };
}

export function useConnectorConfig({
  configKey,
  dataSource,
  disabled,
  owner,
}: {
  configKey: string;
  dataSource: DataSourceType;
  disabled?: boolean;
  owner: LightWorkspaceType;
}) {
  const configFetcher: Fetcher<GetOrPostManagedDataSourceConfigResponseBody> =
    fetcher;

  const url = `/api/w/${owner.sId}/data_sources/${dataSource.sId}/managed/config/${configKey}`;

  const { data, error, mutate } = useSWRWithDefaults(url, configFetcher, {
    disabled,
  });

  return {
    configValue: data ? data.configValue : null,
    isResourcesLoading: !error && !data,
    isResourcesError: error,
    mutateConfig: mutate,
  };
}

export function useConnector({
  dataSource,
  disabled,
  workspaceId,
}: {
  dataSource: DataSourceType;
  disabled?: boolean;
  workspaceId: string;
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
  dataSource: DataSourceType;
  owner: LightWorkspaceType;
}) {
  const sendNotification = useContext(SendNotificationsContext);

  const { mutateConfig } = useConnectorConfig({
    owner,
    dataSource,
    configKey: "botEnabled",
    disabled: true, // Needed just to mutate
  });

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
        title: "Slack Bot Enabled Successfully",
        description: "The Slack bot is now active and ready to use.",
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
