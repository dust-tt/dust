import type {
  GetGlobalAgentFeedbacksResponseBody,
  GlobalAgentFeedbackItem,
} from "@app/lib/api/poke/global_agent_feedbacks";
import { useCellContext } from "@app/lib/auth/CellContext";
import { clientFetch } from "@app/lib/egress/client";
import { emptyArray } from "@app/lib/swr/swr";
import { getUniqueCells } from "@app/poke/swr/cells";
import type { CellType } from "@app/types/cell";
import type { RegionType } from "@app/types/region";
import { useEffect, useMemo, useState } from "react";

export interface GlobalAgentFeedbackItemWithCell
  extends GlobalAgentFeedbackItem {
  cell: CellType;
  region: RegionType;
}

export type CellCursors = Partial<Record<CellType, number | null>>;

export function usePokeGlobalAgentFeedbacksAllCells({
  includeEmpty,
  cursors,
  exhaustedCells,
}: {
  includeEmpty: boolean;
  /** Per-cell `lastId` cursors. Missing / null means first page for that cell. */
  cursors: CellCursors;
  /** Cells that reported `hasMore: false` on a previous batch — skip refetching them. */
  exhaustedCells: ReadonlySet<CellType>;
}) {
  const { cells } = useCellContext();
  const [feedbacks, setFeedbacks] = useState<GlobalAgentFeedbackItemWithCell[]>(
    emptyArray()
  );
  const [hasMoreByCell, setHasMoreByCell] = useState<
    Partial<Record<CellType, boolean>>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  // Stabilize object/set dependencies: parent may pass fresh references with the same values.
  const cursorsKey = useMemo(() => JSON.stringify(cursors), [cursors]);
  const exhaustedKey = useMemo(
    () => [...exhaustedCells].sort().join(","),
    [exhaustedCells]
  );

  useEffect(() => {
    const abortController = new AbortController();
    setIsLoading(true);
    setIsError(false);

    const parsedCursors = JSON.parse(cursorsKey) as CellCursors;
    const exhausted = new Set(
      exhaustedKey === "" ? [] : (exhaustedKey.split(",") as CellType[])
    );

    const run = async () => {
      const cellsToFetch = getUniqueCells(cells).filter(
        (cell) => !exhausted.has(cell.name)
      );

      if (cellsToFetch.length === 0) {
        if (!abortController.signal.aborted) {
          setFeedbacks(emptyArray());
          setHasMoreByCell({});
          setIsError(false);
          setIsLoading(false);
        }
        return;
      }

      const settled = await Promise.allSettled(
        cellsToFetch.map(async (cell) => {
          const params = new URLSearchParams();
          if (includeEmpty) {
            params.set("includeEmpty", "true");
          }
          const lastId = parsedCursors[cell.name];
          if (lastId != null) {
            params.set("lastId", String(lastId));
          }
          const query = params.toString();
          const url = `${cell.url}/api/poke/global-agent-feedbacks${
            query ? `?${query}` : ""
          }`;

          const response = await clientFetch(url, {
            credentials: "include",
            signal: abortController.signal,
          });
          if (!response.ok) {
            throw new Error(`Failed to fetch from ${cell.name}`);
          }

          const data: GetGlobalAgentFeedbacksResponseBody =
            await response.json();
          return {
            cell,
            feedbacks: data.feedbacks,
            hasMore: data.hasMore,
          };
        })
      );

      const merged: GlobalAgentFeedbackItemWithCell[] = [];
      const nextHasMore: Partial<Record<CellType, boolean>> = {};
      let hasErrors = false;

      for (const result of settled) {
        if (result.status !== "fulfilled") {
          hasErrors = true;
          continue;
        }
        nextHasMore[result.value.cell.name] = result.value.hasMore;
        for (const feedback of result.value.feedbacks) {
          merged.push({
            ...feedback,
            cell: result.value.cell.name,
            region: result.value.cell.region,
          });
        }
      }

      merged.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      if (!abortController.signal.aborted) {
        setFeedbacks(merged);
        setHasMoreByCell(nextHasMore);
        setIsError(hasErrors);
        setIsLoading(false);
      }
    };

    void run();

    return () => {
      abortController.abort();
    };
  }, [cells, cursorsKey, exhaustedKey, includeEmpty]);

  const hasMore = Object.values(hasMoreByCell).some(Boolean);

  return {
    feedbacks,
    hasMore,
    hasMoreByCell,
    isLoading,
    isError,
  };
}

/**
 * Build the next per-cell cursors from the current batch: each cell advances to
 * the lowest id it contributed (API pages with `id < lastId`).
 */
export function nextFeedbackCursors(
  feedbacks: GlobalAgentFeedbackItemWithCell[],
  previous: CellCursors,
  hasMoreByCell: Partial<Record<CellType, boolean>>
): CellCursors {
  const next: CellCursors = { ...previous };

  const lastIdByCell = new Map<CellType, number>();
  for (const feedback of feedbacks) {
    const current = lastIdByCell.get(feedback.cell);
    if (current === undefined || feedback.id < current) {
      lastIdByCell.set(feedback.cell, feedback.id);
    }
  }

  for (const [cell, lastId] of lastIdByCell) {
    if (hasMoreByCell[cell]) {
      next[cell] = lastId;
    }
  }

  return next;
}

export function nextExhaustedCells(
  previous: ReadonlySet<CellType>,
  hasMoreByCell: Partial<Record<CellType, boolean>>
): Set<CellType> {
  const next = new Set(previous);
  for (const [cell, hasMore] of Object.entries(hasMoreByCell) as [
    CellType,
    boolean | undefined,
  ][]) {
    if (hasMore === false) {
      next.add(cell);
    }
  }
  return next;
}
