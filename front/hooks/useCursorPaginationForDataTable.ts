import type { PaginationState } from "@tanstack/react-table";
import { useCallback, useState } from "react";

import type { CursorPaginationParams } from "@app/lib/api/pagination";

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
export function useCursorPaginationForDataTable(pageSize: number) {
  const [cursorPagination, setCursorPagination] =
    useState<CursorPaginationParams>({ cursor: null, limit: pageSize });

  // We keep a history of the cursors to allow going back in pages.
  const [cursorHistory, setCursorHistory] = useState<
    CursorPaginationParams["cursor"][]
  >([null]);

  const [tablePagination, setTablePagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize,
  });

  const resetPagination = useCallback(() => {
    setTablePagination({ pageIndex: 0, pageSize: pageSize });
    setCursorHistory([null]);
    setCursorPagination({ cursor: null, limit: pageSize });
  }, [pageSize]);

  const handlePaginationChange = useCallback(
    (newTablePagination: PaginationState, nextPageCursor: string | null) => {
      if (
        // This pagination only supports going forward one page at a time.
        newTablePagination.pageIndex === tablePagination.pageIndex + 1 &&
        nextPageCursor
      ) {
        // Next page - update the history and the cursor.
        setTablePagination(newTablePagination);
        if (newTablePagination.pageIndex === cursorHistory.length) {
          setCursorHistory((prev) => [...prev, nextPageCursor]);
        }
        setCursorPagination({ cursor: nextPageCursor, limit: pageSize });
      } else if (newTablePagination.pageIndex < tablePagination.pageIndex) {
        // Older page - use the appropriate cursor.
        setTablePagination(newTablePagination);
        setCursorPagination({
          cursor: cursorHistory[newTablePagination.pageIndex],
          limit: pageSize,
        });
      }
    },
    [tablePagination.pageIndex, cursorHistory, pageSize]
  );

  return {
    cursorPagination,
    tablePagination,
    resetPagination,
    handlePaginationChange,
  };
}
