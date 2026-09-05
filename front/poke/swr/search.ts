import { clientFetch } from "@app/lib/egress/client";
import type { PokePlanTypeFilter } from "@app/lib/plans/plan_codes";
import { emptyArray } from "@app/lib/swr/swr";
import type { GetPokeSearchItemsResponseBody } from "@app/types/api/poke/search";
import type {
  GetPokeWorkspacesResponseBody,
  PokeWorkspaceType,
} from "@app/types/api/poke/workspaces";
import type { CellInfo, CellType } from "@app/types/cell";
import type { PokeItemBase } from "@app/types/poke";
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
export function usePokeSearchAllCells({
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

export type PokeWorkspaceWithCell = PokeWorkspaceType;

/**
 * Search workspaces across all cells in parallel.
 */
export function usePokeWorkspacesAllCells({
  disabled,
  search,
  upgraded,
  planType,
  cell,
  limit,
  offset,
  cells,
}: {
  disabled?: boolean;
  search?: string;
  upgraded?: boolean;
  planType?: PokePlanTypeFilter;
  // Restrict fetching to a single cell instead of merging all of them.
  cell?: CellType;
  limit?: number;
  offset?: number;
  cells: CellInfo[] | null;
}) {
  const [workspaces, setWorkspaces] = useState<PokeWorkspaceWithCell[]>(
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

    const cellsToFetch = getUniqueCells(
      cells.filter((listedCell) => !cell || listedCell.name === cell)
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
        const allWorkspaces: PokeWorkspaceWithCell[] = [];
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
  }, [disabled, search, upgraded, planType, cell, limit, offset, cells]);

  return {
    workspaces,
    isWorkspacesLoading: !disabled && isLoading,
    isWorkspacesError: isError,
    hasMoreWorkspaces: hasMore,
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
