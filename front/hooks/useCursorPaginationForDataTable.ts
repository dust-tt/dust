import type { CursorPaginationParams } from "@app/lib/api/pagination";
import type { PaginationState } from "@tanstack/react-table";
import { useCallback, useEffect, useRef, useState } from "react";

const FIRST_PAGE_INDEX = 0;

function getInitialCursorPagination(pageSize: number): CursorPaginationParams {
  return { cursor: null, limit: pageSize };
}

function getInitialTablePagination(pageSize: number): PaginationState {
  return { pageIndex: FIRST_PAGE_INDEX, pageSize };
}

/**
 * Hook to manage pagination for a table where the data is fetched using cursor pagination.
 *
 * - Assumes that only a next cursor is retrieved when fetching new data,
 * and therefore stores an entire history of previous cursors.
 * - Does not support hash parameters and therefore link sharing, since going back requires the previous cursor
 * and going back several times requires the full history.
 * - Ties the cursor pagination with the table pagination, and exposes a `tablePagination` that can directly be used in
 * a `DataTable`.
 * - Does not support moving forward more than one page at a time (will ignore the action).
 *
 * Users of this hook should eventually be updated to a less stateful pagination mechanism,
 *  where, for instance, both a next and a previous cursor would be exposed when fetching a page.
 */
export function useCursorPaginationForDataTable(
  pageSize: number,
  resetKey?: string
) {
  const [cursorPagination, setCursorPagination] =
    useState<CursorPaginationParams>(getInitialCursorPagination(pageSize));

  // We keep a history of the cursors to allow going back in pages.
  const [cursorHistory, setCursorHistory] = useState<
    CursorPaginationParams["cursor"][]
  >([null]);

  const [tablePagination, setTablePagination] = useState<PaginationState>({
    pageIndex: FIRST_PAGE_INDEX,
    pageSize,
  });
  const latestResetKeyRef = useRef(resetKey);
  const shouldResetFromKeyChange = latestResetKeyRef.current !== resetKey;
  const effectiveCursorPagination = shouldResetFromKeyChange
    ? getInitialCursorPagination(pageSize)
    : cursorPagination;
  const effectiveCursorHistory = shouldResetFromKeyChange
    ? [null]
    : cursorHistory;
  const effectiveTablePagination = shouldResetFromKeyChange
    ? getInitialTablePagination(pageSize)
    : tablePagination;

  const resetPagination = useCallback(() => {
    setTablePagination(getInitialTablePagination(pageSize));
    setCursorHistory([null]);
    setCursorPagination(getInitialCursorPagination(pageSize));
  }, [pageSize]);

  useEffect(() => {
    if (!shouldResetFromKeyChange) {
      return;
    }

    latestResetKeyRef.current = resetKey;
    resetPagination();
  }, [resetKey, resetPagination, shouldResetFromKeyChange]);

  const handlePaginationChange = useCallback(
    (newTablePagination: PaginationState, nextPageCursor: string | null) => {
      if (
        // This pagination only supports going forward one page at a time.
        newTablePagination.pageIndex ===
          effectiveTablePagination.pageIndex + 1 &&
        nextPageCursor
      ) {
        // Next page - update the history and the cursor.
        setTablePagination(newTablePagination);
        if (newTablePagination.pageIndex === effectiveCursorHistory.length) {
          setCursorHistory((prev) => [...prev, nextPageCursor]);
        }
        setCursorPagination({ cursor: nextPageCursor, limit: pageSize });
      } else if (
        newTablePagination.pageIndex < effectiveTablePagination.pageIndex
      ) {
        // Older page - use the appropriate cursor.
        setTablePagination(newTablePagination);
        setCursorPagination({
          cursor: effectiveCursorHistory[newTablePagination.pageIndex],
          limit: pageSize,
        });
      }
    },
    [effectiveCursorHistory, effectiveTablePagination.pageIndex, pageSize]
  );

  return {
    cursorPagination: effectiveCursorPagination,
    tablePagination: effectiveTablePagination,
    resetPagination,
    handlePaginationChange,
  };
}
