import { clientFetch } from "@app/lib/egress/client";
import type { PokePlanTypeFilter } from "@app/lib/plans/plan_codes";
import { emptyArray } from "@app/lib/swr/swr";
import type { GetPokeSearchItemsResponseBody } from "@app/types/api/poke/search";
import type {
  GetPokeWorkspacesResponseBody,
  PokeWorkspaceType,
} from "@app/types/api/poke/workspaces";
import type { CellInfo } from "@app/types/cell";
import type { PokeItemBase } from "@app/types/poke";
import type { RegionType } from "@app/types/region";
import { useEffect, useState } from "react";

// Deduplicate cells by URL. In dev, all cells can point to the same localhost
// server, so without this we would fire one identical request per cell and
// list every workspace once per cell.
function getUniqueCells(cells: CellInfo[]): CellInfo[] {
  const seen = new Set<string>();
  return cells.filter((cell) => {
    const url = cell.url;
    if (seen.has(url)) {
      return false;
    }
    seen.add(url);
    return true;
  });
}

/**
 * Search across all cells in parallel.
 * Returns results tagged with their source cell and region.
 */
export function usePokeSearchAllRegions({
  disabled,
  search,
  cells,
}: {
  disabled?: boolean;
  search?: string;
  cells: CellInfo[] | null;
}) {
  const [results, setResults] = useState<PokeItemBase[]>(emptyArray());
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (disabled || !search || !cells) {
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
        const cellPromises = getUniqueCells(cells).map(async (cell) => {
          const baseUrl = cell.url;
          const url = `${baseUrl}/api/poke/search?${queryParams.toString()}`;

          const response = await clientFetch(url, { credentials: "include" });
          if (!response.ok) {
            throw new Error(`Failed to fetch from ${cell.name}`);
          }

          const data: GetPokeSearchItemsResponseBody = await response.json();
          return data.results.map((item) => ({
            ...item,
            cell: cell.name,
            region: cell.region,
          }));
        });

        const settledResults = await Promise.allSettled(cellPromises);
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
  }, [disabled, search, cells]);

  return {
    results,
    isLoading,
    isError,
  };
}

export type PokeWorkspaceWithPlacement = PokeWorkspaceType;

/**
 * Search workspaces across all cells in parallel.
 */
export function usePokeWorkspacesAllRegions({
  disabled,
  search,
  upgraded,
  planType,
  region,
  limit,
  offset,
  cells,
}: {
  disabled?: boolean;
  search?: string;
  upgraded?: boolean;
  planType?: PokePlanTypeFilter;
  // Restrict fetching to a single region instead of merging all of them.
  region?: RegionType;
  limit?: number;
  offset?: number;
  cells: CellInfo[] | null;
}) {
  const [workspaces, setWorkspaces] = useState<PokeWorkspaceWithPlacement[]>(
    emptyArray()
  );
  const [isLoading, setIsLoading] = useState(false);
  const [isError, setIsError] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    if (disabled || !cells) {
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

    const cellsToFetch = getUniqueCells(cells).filter(
      (cell) => !region || cell.region === region
    );

    const run = async () => {
      try {
        const cellPromises = cellsToFetch.map(async (cell) => {
          const baseUrl = cell.url;
          const url = `${baseUrl}/api/poke/workspaces?${queryParams.toString()}`;

          const response = await clientFetch(url, {
            credentials: "include",
            signal: abortController.signal,
          });
          if (!response.ok) {
            throw new Error(`Failed to fetch from ${cell.name}`);
          }

          const data: GetPokeWorkspacesResponseBody = await response.json();
          return {
            workspaces: data.workspaces,
            hasMore: data.hasMore,
          };
        });

        const settledResults = await Promise.allSettled(cellPromises);
        const allWorkspaces: PokeWorkspaceWithPlacement[] = [];
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
  }, [disabled, search, upgraded, planType, region, limit, offset, cells]);

  return {
    workspaces,
    isWorkspacesLoading: !disabled && isLoading,
    isWorkspacesError: isError,
    hasMoreWorkspaces: hasMore,
  };
}
