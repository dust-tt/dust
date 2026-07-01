import { clientFetch } from "@app/lib/egress/client";
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
    if (limit !== undefined) {
      queryParams.set("limit", String(limit));
    }

    const run = async () => {
      try {
        const regionPromises = getUniqueRegions(regionUrls).map(
          async (region) => {
            const baseUrl = regionUrls[region];
            const url = `${baseUrl}/api/poke/workspaces?${queryParams.toString()}`;

            const response = await clientFetch(url, {
              credentials: "include",
              signal: abortController.signal,
            });
            if (!response.ok) {
              throw new Error(`Failed to fetch from ${region}`);
            }

            const data: GetPokeWorkspacesResponseBody = await response.json();
            return data.workspaces.map((ws) => ({ ...ws, region }));
          }
        );

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

        if (!abortController.signal.aborted) {
          setWorkspaces(allWorkspaces);
          setIsError(hasErrors);
          setIsLoading(false);
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
  }, [disabled, search, upgraded, limit, regionUrls]);

  return {
    workspaces,
    isWorkspacesLoading: !disabled && isLoading,
    isWorkspacesError: isError,
  };
}

export interface PokeConnectorRedirect {
  redirectUrl: string;
  region: RegionType;
}

/**
 * Resolve a connector redirect across all regions in parallel. A connector ID
 * is only known to its own region's connectors service, so we query every
 * region and keep the first successful match, tagged with its source region.
 * This lets a `/connectors/:id` link resolve regardless of which region the SPA
 * currently points at.
 */
export function usePokeConnectorRedirectAllRegions({
  connectorId,
  regionUrls,
}: {
  connectorId: string;
  regionUrls: Record<RegionType, string> | null;
}) {
  const [redirect, setRedirect] = useState<PokeConnectorRedirect | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (!regionUrls) {
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setIsError(false);
    setRedirect(null);

    const run = async () => {
      const regionPromises = getUniqueRegions(regionUrls).map(
        async (region) => {
          const baseUrl = regionUrls[region];
          const url = `${baseUrl}/api/poke/connectors/${connectorId}/redirect`;

          const response = await clientFetch(url, { credentials: "include" });
          if (!response.ok) {
            throw new Error(`Connector not found in ${region}`);
          }

          const data: { redirectUrl: string } = await response.json();
          return { redirectUrl: data.redirectUrl, region };
        }
      );

      const settledResults = await Promise.allSettled(regionPromises);
      if (cancelled) {
        return;
      }

      const found = settledResults.find(
        (result) => result.status === "fulfilled"
      );
      if (found && found.status === "fulfilled") {
        setRedirect(found.value);
      } else {
        setIsError(true);
      }
      setIsLoading(false);
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [connectorId, regionUrls]);

  return { redirect, isLoading, isError };
}
