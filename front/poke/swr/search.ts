import { clientFetch } from "@app/lib/egress/client";
import type { PokePlanTypeFilter } from "@app/lib/plans/plan_codes";
import { emptyArray, useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { GetPokeSearchItemsResponseBody } from "@app/types/api/poke/search";
import type {
  GetPokeWorkspacesResponseBody,
  PokeWorkspaceType,
} from "@app/types/api/poke/workspaces";
import type { PokeItemBase } from "@app/types/poke";
import type { RegionType } from "@app/types/region";
import { SUPPORTED_REGIONS } from "@app/types/region";
import { useEffect, useState } from "react";
import type { Fetcher } from "swr";

// Deduplicate regions by URL. In dev, all regions point to the same localhost
// server, so without this we would fire one identical request per region and
// list every workspace once per region.
function getUniqueRegions(
  regionUrls: Record<RegionType, string>
): RegionType[] {
  const seen = new Set<string>();
  return SUPPORTED_REGIONS.filter((region) => {
    const url = regionUrls[region];
    if (seen.has(url)) {
      return false;
    }
    seen.add(url);
    return true;
  });
}

export function usePokeSearch({
  disabled,
  search,
}: {
  disabled?: boolean;
  search?: string;
} = {}) {
  const { fetcher } = useFetcher();
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
        const regionPromises = getUniqueRegions(regionUrls).map(
          async (region) => {
            const baseUrl = regionUrls[region];
            const url = `${baseUrl}/api/poke/search?${queryParams.toString()}`;

            const response = await clientFetch(url, { credentials: "include" });
            if (!response.ok) {
              throw new Error(`Failed to fetch from ${region}`);
            }

            const data: GetPokeSearchItemsResponseBody = await response.json();
            return data.results.map((item) => ({ ...item, region }));
          }
        );

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
  planType,
  region,
  limit,
  offset,
  regionUrls,
}: {
  disabled?: boolean;
  search?: string;
  upgraded?: boolean;
  planType?: PokePlanTypeFilter;
  // Restrict fetching to a single region instead of merging all of them.
  region?: RegionType;
  limit?: number;
  offset?: number;
  regionUrls: Record<RegionType, string> | null;
}) {
  const [workspaces, setWorkspaces] = useState<PokeWorkspaceWithRegion[]>(
    emptyArray()
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    if (disabled || !regionUrls) {
      setWorkspaces(emptyArray());
      setIsLoading(false);
      setIsError(false);
      setHasMore(false);
      return;
    }

    // Abort in-flight fetches when the effect re-runs (e.g. user is typing).
    const abortController = new AbortController();
    setIsLoading(true);
    setIsError(false);

    const queryParams = new URLSearchParams();
    if (search) {
      queryParams.set("search", search);
    }
    if (upgraded !== undefined) {
      queryParams.set("upgraded", String(upgraded));
    }
    if (planType !== undefined) {
      queryParams.set("planType", planType);
    }
    if (limit !== undefined) {
      queryParams.set("limit", String(limit));
    }
    if (offset !== undefined) {
      queryParams.set("offset", String(offset));
    }

    const regionsToFetch = region ? [region] : getUniqueRegions(regionUrls);

    const run = async () => {
      try {
        const regionPromises = regionsToFetch.map(async (fetchedRegion) => {
          const baseUrl = regionUrls[fetchedRegion];
          const url = `${baseUrl}/api/poke/workspaces?${queryParams.toString()}`;

          const response = await clientFetch(url, {
            credentials: "include",
            signal: abortController.signal,
          });
          if (!response.ok) {
            throw new Error(`Failed to fetch from ${fetchedRegion}`);
          }

          const data: GetPokeWorkspacesResponseBody = await response.json();
          return {
            workspaces: data.workspaces.map((ws) => ({
              ...ws,
              region: fetchedRegion,
            })),
            hasMore: data.hasMore,
          };
        });

        const settledResults = await Promise.allSettled(regionPromises);
        const allWorkspaces: PokeWorkspaceWithRegion[] = [];
        let hasErrors = false;
        let anyHasMore = false;

        for (const result of settledResults) {
          if (result.status === "fulfilled") {
            allWorkspaces.push(...result.value.workspaces);
            anyHasMore = anyHasMore || result.value.hasMore;
          } else {
            hasErrors = true;
          }
        }

        if (!abortController.signal.aborted) {
          setWorkspaces(allWorkspaces);
          setIsError(hasErrors);
          setIsLoading(false);
          setHasMore(anyHasMore);
        }
      } catch {
        if (!abortController.signal.aborted) {
          setIsError(true);
          setIsLoading(false);
        }
      }
    };

    void run();

    return () => {
      abortController.abort();
    };
  }, [disabled, search, upgraded, planType, region, limit, offset, regionUrls]);

  return {
    workspaces,
    isWorkspacesLoading: !disabled && isLoading,
    isWorkspacesError: isError,
    hasMoreWorkspaces: hasMore,
  };
}
