import { clientFetch } from "@app/lib/egress/client";
import type { CellInfo } from "@app/types/cell";

/**
 * Deduplicate cells by URL. In dev, all cells can point to the same localhost
 * server, so without this we would fire one identical request per cell.
 */
export function getUniqueCells(cells: CellInfo[]): CellInfo[] {
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

export type CellFetchResult<T> =
  | { cell: CellInfo; ok: true; data: T }
  | { cell: CellInfo; ok: false; error: unknown };

/**
 * Fetch the same poke path from every unique cell in parallel.
 * Absolute URLs bypass the selected-cell base URL rewrite in `clientFetch`.
 */
export async function fetchPokeFromAllCells<T>({
  cells,
  path,
  init,
}: {
  cells: CellInfo[];
  /** Absolute path beginning with `/api/poke/...`, optionally with a query string. */
  path: string;
  init?: RequestInit;
}): Promise<CellFetchResult<T>[]> {
  const uniqueCells = getUniqueCells(cells);

  const settled = await Promise.allSettled(
    uniqueCells.map(async (cell): Promise<CellFetchResult<T>> => {
      const response = await clientFetch(`${cell.url}${path}`, {
        credentials: "include",
        ...init,
      });
      if (!response.ok) {
        throw new Error(
          `Failed to fetch from ${cell.name}: ${response.status}`
        );
      }
      const data = (await response.json()) as T;
      return { cell, ok: true, data };
    })
  );

  return settled.map((result, index) => {
    if (result.status === "fulfilled") {
      return result.value;
    }
    return { cell: uniqueCells[index], ok: false, error: result.reason };
  });
}
