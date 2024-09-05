import type {
  ConnectorPermission,
  ContentNodesViewType,
  DataSourceType,
  LightWorkspaceType,
} from "@dust-tt/types";
import { useMemo } from "react";
import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetConnectorResponseBody } from "@app/pages/api/w/[wId]/data_sources/[name]/connector";
import type { GetOrPostManagedDataSourceConfigResponseBody } from "@app/pages/api/w/[wId]/data_sources/[name]/managed/config/[key]";
import type { GetDataSourcePermissionsResponseBody } from "@app/pages/api/w/[wId]/data_sources/[name]/managed/permissions";

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

  let url = `/api/w/${owner.sId}/data_sources/${encodeURIComponent(
    dataSource.name
  )}/managed/permissions?viewType=${viewType}`;
  if (parentId) {
    url += `&parentId=${parentId}`;
  }
  if (filterPermission) {
    url += `&filterPermission=${filterPermission}`;
  }

  const { data, error } = useSWRWithDefaults(
    disabled ? null : url,
    permissionsFetcher
  );

  return {
    resources: useMemo(() => (data ? data.resources : []), [data]),
    isResourcesLoading: !error && !data,
    isResourcesError: error,
  };
}

export function useConnectorConfig({
  owner,
  dataSource,
  configKey,
}: {
  owner: LightWorkspaceType;
  dataSource: DataSourceType;
  configKey: string;
}) {
  const configFetcher: Fetcher<GetOrPostManagedDataSourceConfigResponseBody> =
    fetcher;

  const url = `/api/w/${owner.sId}/data_sources/${encodeURIComponent(
    dataSource.name
  )}/managed/config/${configKey}`;

  const { data, error, mutate } = useSWRWithDefaults(url, configFetcher);

  return {
    configValue: data ? data.configValue : null,
    isResourcesLoading: !error && !data,
    isResourcesError: error,
    mutateConfig: mutate,
  };
}

export function useConnector({
  workspaceId,
  dataSourceId,
}: {
  workspaceId: string;
  dataSourceId: string;
}) {
  const configFetcher: Fetcher<GetConnectorResponseBody> = fetcher;

  const url = `/api/w/${workspaceId}/data_sources/${dataSourceId}/connector`;

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
  });

  return {
    connector: data ? data.connector : null,
    isConnectorLoading: !error && !data,
    isConnectorError: error,
    mutateConnector: mutate,
  };
}
