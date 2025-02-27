import type { PaginationState } from "@tanstack/react-table";
import { useCallback, useState } from "react";

import type { CursorPaginationParams } from "@app/lib/api/pagination";

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
