import type {
  DataSourceType,
  LightWorkspaceType,
  TagSearchParams,
  TagSearchResult,
} from "@dust-tt/types";
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

export function useTagSearchEndpoint({
  owner,
}: {
  owner: LightWorkspaceType;
}): {
  searchTags: (params: TagSearchParams) => Promise<TagSearchResult[]>;
} {
  const searchTags = async (
    params: TagSearchParams
  ): Promise<TagSearchResult[]> => {
    const res = await fetch(`/api/w/${owner.sId}/data_sources/tags`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      throw new Error("Failed to search tags");
    }

    const data = await res.json();
    return data.tags;
  };

  return { searchTags };
}
