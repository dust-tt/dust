import { MIN_SEARCH_QUERY_SIZE } from "@dust-tt/types";
import { useMemo } from "react";

import { useSWRWithDefaults } from "@app/lib/swr/swr";
import { WorkspaceType } from "../../../sdks/js";

export function useWorkspaceSearch({
  owner,
  query,
  viewType = "all",
  limit = 10,
  disabled = false,
}: {
  owner: WorkspaceType;
  query: string;
  viewType?: "tables" | "documents" | "all";
  limit?: number;
  disabled?: boolean;
}) {
  const body = useMemo(
    () => ({
      datasourceViewIds: [],
      query,
      viewType,
      limit,
    }),
    [query, viewType, limit]
  );

  const key =
    query.length >= MIN_SEARCH_QUERY_SIZE
      ? [`/api/w/${owner.sId}/search`, body]
      : null;

  const { data, error, mutate } = useSWRWithDefaults(
    key as [string, typeof body],
    async ([url, body]) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        throw new Error("Failed to fetch search results");
      }

      return res.json();
    },
    { revalidateOnFocus: false, revalidateOnReconnect: false, disabled }
  );

  return {
    nodes: data?.nodes || [],
    isLoading: !error && !data && !disabled,
    isError: !!error,
    mutate,
  };
}
