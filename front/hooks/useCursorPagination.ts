import type { CursorPaginationParams } from "@app/lib/api/pagination";
import { useCallback, useState } from "react";

export function useCursorPagination(pageSize: number) {
  const [cursorPagination, setCursorPagination] =
    useState<CursorPaginationParams>({
      cursor: null,
      limit: pageSize,
    });

  const [pageIndex, setPageIndex] = useState(0);

  const reset = useCallback(() => {
    setPageIndex(0);
    setCursorPagination({ cursor: null, limit: pageSize });
  }, [pageSize]);

  const handleLoadNext = useCallback(
    (nextCursor: string | null) => {
      if (nextCursor) {
        setPageIndex((prev) => prev + 1);
        setCursorPagination({ cursor: nextCursor, limit: pageSize });
      }
    },
    [pageSize]
  );

  return {
    cursorPagination,
    pageIndex,
    reset,
    handleLoadNext,
  };
}
