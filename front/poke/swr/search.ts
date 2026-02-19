import type { RegionType } from "@app/lib/api/regions/config";
import { SUPPORTED_REGIONS } from "@app/lib/api/regions/config";
import { clientFetch } from "@app/lib/egress/client";
import { emptyArray, fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetPokeSearchItemsResponseBody } from "@app/pages/api/poke/search";
import type {
  GetPokeWorkspacesResponseBody,
  PokeWorkspaceType,
} from "@app/pages/api/poke/workspaces";
import type { PokeItemBase } from "@app/types/poke";
import { useEffect, useState } from "react";
import type { Fetcher } from "swr";

export function usePokeSearch({
  disabled,
  search,
}: {
  disabled?: boolean;
  search?: string;
} = {}) {
  const workspacesFetcher: Fetcher<GetPokeSearchItemsResponseBody> = fetcher;

  const queryParams = new URLSearchParams({
    search: search ?? "",
  });

  const { data, error } = useSWRWithDefaults(
    `/api/poke/search?${queryParams.toString()}`,
    workspacesFetcher,
    {
      disabled,
    }
  );

  return {
    results: data?.results ?? emptyArray(),
    isLoading: !error && !data && !disabled,
    isError: error,
  };
}

/**
 * Search across all regions in parallel.
 * Returns results tagged with their source region.
 */
export function usePokeSearchAllRegions({
  disabled,
  search,
  regionUrls,
}: {
  disabled?: boolean;
  search?: string;
  regionUrls: Record<RegionType, string> | null;
}) {
  const [results, setResults] = useState<PokeItemBase[]>(emptyArray());
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (disabled || !search || !regionUrls) {
      setResults(emptyArray());
      setIsLoading(false);
      setIsError(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setIsError(false);

    const queryParams = new URLSearchParams({ search });

    const run = async () => {
      try {
        const regionPromises = SUPPORTED_REGIONS.map(async (region) => {
          const baseUrl = regionUrls[region];
          const url = `${baseUrl}/api/poke/search?${queryParams.toString()}`;

          const response = await clientFetch(url, { credentials: "include" });
          if (!response.ok) {
            throw new Error(`Failed to fetch from ${region}`);
          }

          const data: GetPokeSearchItemsResponseBody = await response.json();
          return data.results.map((item) => ({ ...item, region }));
        });

        const settledResults = await Promise.allSettled(regionPromises);
        const allResults: PokeItemBase[] = [];
        let hasErrors = false;

        for (const result of settledResults) {
          if (result.status === "fulfilled") {
            allResults.push(...result.value);
          } else {
            hasErrors = true;
          }
        }

        if (!cancelled) {
          setResults(allResults);
          setIsError(hasErrors);
          setIsLoading(false);
        }
      } catch {
        if (!cancelled) {
          setIsError(true);
          setIsLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [disabled, search, regionUrls]);

  return {
    results,
    isLoading,
    isError,
  };
}

export type PokeWorkspaceWithRegion = PokeWorkspaceType & {
  region?: RegionType;
};

/**
 * Search workspaces across all regions in parallel.
 * Returns workspaces tagged with their source region.
 */
export function usePokeWorkspacesAllRegions({
  disabled,
  search,
  upgraded,
  limit,
  regionUrls,
}: {
  disabled?: boolean;
  search?: string;
  upgraded?: boolean;
  limit?: number;
  regionUrls: Record<RegionType, string> | null;
}) {
  const [workspaces, setWorkspaces] = useState<PokeWorkspaceWithRegion[]>(
    emptyArray()
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (disabled || !regionUrls) {
      setWorkspaces(emptyArray());
      setIsLoading(false);
      setIsError(false);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setIsError(false);

    const queryParams = new URLSearchParams();
    if (search) {
      queryParams.set("search", search);
    }
    if (upgraded !== undefined) {
      queryParams.set("upgraded", String(upgraded));
    }
    if (limit !== undefined) {
      queryParams.set("limit", String(limit));
    }

    const run = async () => {
      try {
        const regionPromises = SUPPORTED_REGIONS.map(async (region) => {
          const baseUrl = regionUrls[region];
          const url = `${baseUrl}/api/poke/workspaces?${queryParams.toString()}`;

          const response = await clientFetch(url, { credentials: "include" });
          if (!response.ok) {
            throw new Error(`Failed to fetch from ${region}`);
          }

          const data: GetPokeWorkspacesResponseBody = await response.json();
          return data.workspaces.map((ws) => ({ ...ws, region }));
        });

        const settledResults = await Promise.allSettled(regionPromises);
        const allWorkspaces: PokeWorkspaceWithRegion[] = [];
        let hasErrors = false;

        for (const result of settledResults) {
          if (result.status === "fulfilled") {
            allWorkspaces.push(...result.value);
          } else {
            hasErrors = true;
          }
        }

        if (!cancelled) {
          setWorkspaces(allWorkspaces);
          setIsError(hasErrors);
          setIsLoading(false);
        }
      } catch {
        if (!cancelled) {
          setIsError(true);
          setIsLoading(false);
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [disabled, search, upgraded, limit, regionUrls]);

  return {
    workspaces,
    isWorkspacesLoading: isLoading,
    isWorkspacesError: isError,
  };
}
