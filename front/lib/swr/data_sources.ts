import type { DataSourceType, LightWorkspaceType } from "@dust-tt/types";
import { useMemo } from "react";
import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetDataSourcesResponseBody } from "@app/pages/api/w/[wId]/data_sources";
import type { GetDocumentsResponseBody } from "@app/pages/api/w/[wId]/data_sources/[dsId]/documents";
import type { GetDataSourceUsageResponseBody } from "@app/pages/api/w/[wId]/data_sources/[dsId]/usage";

export function useDataSources(
  owner: LightWorkspaceType,
  options = { disabled: false }
) {
  const { disabled } = options;
  const dataSourcesFetcher: Fetcher<GetDataSourcesResponseBody> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/data_sources`,
    dataSourcesFetcher,
    { disabled }
  );

  return {
    dataSources: useMemo(() => (data ? data.dataSources : []), [data]),
    isDataSourcesLoading: disabled ? false : !error && !data,
    isDataSourcesError: disabled ? false : error,
    mutateDataSources: mutate,
  };
}

export function useDataSourceDocuments(
  owner: LightWorkspaceType,
  dataSource: DataSourceType,
  limit: number,
  offset: number
) {
  const documentsFetcher: Fetcher<GetDocumentsResponseBody> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/data_sources/${dataSource.sId}/documents?limit=${limit}&offset=${offset}`,
    documentsFetcher
  );

  return {
    documents: useMemo(() => (data ? data.documents : []), [data]),
    total: data ? data.total : 0,
    isDocumentsLoading: !error && !data,
    isDocumentsError: error,
    mutateDocuments: mutate,
  };
}

export function useDataSourceUsage({
  owner,
  dataSource,
}: {
  owner: LightWorkspaceType;
  dataSource: DataSourceType;
}) {
  const usageFetcher: Fetcher<GetDataSourceUsageResponseBody> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/data_sources/${dataSource.sId}/usage`,
    usageFetcher
  );

  return {
    usage: useMemo(() => (data ? data.usage : null), [data]),
    isUsageLoading: !error && !data,
    isUsageError: error,
    mutate,
  };
}
