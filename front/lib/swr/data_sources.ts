import type { DataSourceType, LightWorkspaceType } from "@dust-tt/types";
import { useMemo } from "react";
import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetDataSourceUsageResponseBody } from "@app/pages/api/w/[wId]/data_sources/[dsId]/usage";

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
