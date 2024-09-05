import type { LightWorkspaceType } from "@dust-tt/types";
import { useMemo } from "react";
import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetDataSourcesResponseBody } from "@app/pages/api/w/[wId]/data_sources";
import type { GetDocumentsResponseBody } from "@app/pages/api/w/[wId]/data_sources/[name]/documents";

export function useDataSources(
  owner: LightWorkspaceType,
  options = { disabled: false }
) {
  const { disabled } = options;
  const dataSourcesFetcher: Fetcher<GetDataSourcesResponseBody> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    disabled ? null : `/api/w/${owner.sId}/data_sources`,
    dataSourcesFetcher
  );

  return {
    dataSources: useMemo(() => (data ? data.dataSources : []), [data]),
    isDataSourcesLoading: disabled ? false : !error && !data,
    isDataSourcesError: disabled ? false : error,
    mutateDataSources: mutate,
  };
}

export function useDocuments(
  owner: LightWorkspaceType,
  dataSource: { name: string },
  limit: number,
  offset: number
) {
  const documentsFetcher: Fetcher<GetDocumentsResponseBody> = fetcher;
  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${owner.sId}/data_sources/${
      dataSource.name
    }/documents?limit=${limit}&offset=${offset}`,
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
