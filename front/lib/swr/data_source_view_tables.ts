import type { DataSourceViewType, LightWorkspaceType } from "@dust-tt/types";
import type {
  PatchDataSourceTableRequestBody,
  PostDataSourceTableRequestBody,
} from "@dust-tt/types";
import assert from "assert";
import { useMemo } from "react";
import type { Fetcher } from "swr";
import type { SWRMutationConfiguration } from "swr/mutation";
import useSWRMutation from "swr/mutation";

import { useDataSourceViewContentNodes } from "@app/lib/swr/data_source_views";
import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import { decorateWithInvalidation, mutationFn } from "@app/lib/swr/utils";
import type { ListTablesResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_source_views/[dsvId]/tables";
import type { GetDataSourceViewTableResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_source_views/[dsvId]/tables/[tableId]";
import type { PostTableResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_sources/[dsId]/tables";
import type { PatchTableResponseBody } from "@app/pages/api/w/[wId]/spaces/[spaceId]/data_sources/[dsId]/tables/[tableId]";

// Centralized way to get urls -> reduces key-related inconcistencies
type CrudUseCases = "CREATE" | "GET" | "UPDATE" | "GET_LIST";
function getUrlHasValidParameters(
  useCase: CrudUseCases,
  tableId?: string
): tableId is string {
  // Only require tableId for GET and PATCH methods
  return useCase === "CREATE" || !!tableId;
}
const getUrl = ({
  useCase,
  owner,
  dataSourceView,
  tableId,
}: {
  useCase: CrudUseCases;
  owner: LightWorkspaceType;
  dataSourceView: DataSourceViewType;
  tableId?: string;
}) => {
  assert(
    getUrlHasValidParameters(useCase, tableId),
    "Cannot get or update a table without a tableId"
  );

  const baseUrl = `/api/w/${owner.sId}/spaces/${dataSourceView.spaceId}`;
  const baseDataSourceUrl = `${baseUrl}/data_sources/${dataSourceView.dataSource.sId}`;
  const baseDataSourceViewUrl = `${baseUrl}/data_source_views/${dataSourceView.sId}`;
  switch (useCase) {
    case "CREATE":
      return `${baseDataSourceUrl}/tables`;
    case "UPDATE":
      return `${baseDataSourceUrl}/tables/${encodeURIComponent(tableId)}`;
    case "GET":
      return `${baseDataSourceViewUrl}/tables/${encodeURIComponent(tableId)}`;
    case "GET_LIST":
      return `${baseDataSourceViewUrl}/tables`;
  }
};

export function useDataSourceViewTable({
  dataSourceView,
  tableId,
  owner,
  disabled,
}: {
  dataSourceView: DataSourceViewType | null;
  tableId: string | null;
  owner: LightWorkspaceType;
  disabled?: boolean;
}) {
  const dataSourceViewTableFetcher: Fetcher<GetDataSourceViewTableResponseBody> =
    fetcher;
  const url =
    dataSourceView && tableId
      ? getUrl({
          useCase: "GET",
          owner,
          dataSourceView,
          tableId,
        })
      : null;

  const { data, error, mutate } = useSWRWithDefaults(
    url,
    dataSourceViewTableFetcher,
    {
      disabled,
    }
  );

  return {
    table: data?.table,
    isTableLoading: !disabled && !error && !data,
    isTableError: error,
    mutateTable: mutate,
  };
}

export function useDataSourceViewTables({
  dataSourceView,
  owner,
}: {
  dataSourceView: DataSourceViewType | null;
  owner: LightWorkspaceType;
}) {
  const tablesFetcher: Fetcher<ListTablesResponseBody> = fetcher;
  const disabled = !dataSourceView;

  const url = dataSourceView
    ? getUrl({
        useCase: "GET_LIST",
        owner,
        dataSourceView,
      })
    : null;
  const { data, error, mutate } = useSWRWithDefaults(
    disabled ? null : url,
    tablesFetcher
  );

  return {
    tables: useMemo(() => (data ? data.tables : []), [data]),
    isTablesLoading: !disabled && !error && !data,
    isTablesError: error,
    mutateTables: mutate,
  };
}
export function useUpdateDataSourceViewTable(
  owner: LightWorkspaceType,
  dataSourceView: DataSourceViewType,
  tableName: string,
  options?: SWRMutationConfiguration<PatchTableResponseBody, Error, string>
) {
  // Used only for cache invalidation
  const { mutate: mutateContentNodes } = useDataSourceViewContentNodes({
    owner,
    dataSourceView,
    disabled: true,
  });

  // Used only for cache invalidation
  const { mutateTable } = useDataSourceViewTable({
    owner,
    dataSourceView,
    tableId: tableName,
    disabled: true,
  });

  // Decorate options's onSuccess with cache invalidation
  const invalidateCacheEntries = async () => {
    await Promise.all([mutateContentNodes, mutateTable]);
  };
  const decoratedOptions = decorateWithInvalidation(
    options,
    invalidateCacheEntries
  );

  const patchUrl = tableName
    ? getUrl({
        useCase: "UPDATE",
        owner,
        dataSourceView,
        tableId: tableName,
      })
    : null;
  const sendPatchRequest = mutationFn<PatchDataSourceTableRequestBody>("PATCH");
  return useSWRMutation(patchUrl, sendPatchRequest, decoratedOptions);
}

export function useCreateDataSourceViewTable(
  owner: LightWorkspaceType,
  dataSourceView: DataSourceViewType,
  options?: SWRMutationConfiguration<PostTableResponseBody, Error, string>
) {
  // Used only for cache invalidation
  const { mutate: mutateContentNodes } = useDataSourceViewContentNodes({
    owner,
    dataSourceView,
    disabled: true,
  });

  // Decorate options's onSuccess with cache invalidation
  const invalidateCacheEntries = async () => {
    await mutateContentNodes();
  };
  const decoratedOptions = decorateWithInvalidation(
    options,
    invalidateCacheEntries
  );

  // Note that this url is not used for fetch -> There is no need to invalidate it on practice.
  const createUrl = getUrl({
    useCase: "CREATE",
    owner,
    dataSourceView,
  });
  const sendPostRequest = mutationFn<PostDataSourceTableRequestBody>("POST");
  return useSWRMutation(createUrl, sendPostRequest, decoratedOptions);
}
