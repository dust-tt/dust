import { PaginationState } from "@tanstack/react-table";
import { useMemo } from "react";

import { HistoryOptions, useHashParam } from "@sparkle/hooks/useHashParams";

const defaultPageSize = 25;

export const usePaginationFromUrl = ({
  urlPrefix,
  initialPageSize = defaultPageSize,
  defaultHistory = "push",
}: {
  urlPrefix?: string;
  initialPageSize?: number;
  defaultHistory?: HistoryOptions;
}) => {
  const [pageIndexParam, setPageIndexParam] = useHashParam(
    urlPrefix ? `${urlPrefix}PageIndex` : "pageIndex"
  );
  const [pageSizeParam, setPageSizeParam] = useHashParam(
    urlPrefix ? `${urlPrefix}PageSize` : "pageSize"
  );

  const pageIndex = pageIndexParam ? parseInt(pageIndexParam) : 0;
  const pageSize = pageSizeParam ? parseInt(pageSizeParam) : initialPageSize;

  const res = useMemo(() => {
    const pagination: PaginationState = { pageIndex, pageSize };

    const setPagination = (
      newValue: PaginationState,
      history?: HistoryOptions
    ) => {
      if (newValue.pageIndex !== pageIndex || newValue.pageSize !== pageSize) {
        setPageIndexParam(newValue.pageIndex.toString(), {
          history: history ?? defaultHistory,
        });
        setPageSizeParam(newValue.pageSize.toString());
      }
    };

    return { pagination, setPagination };
  }, [pageIndex, pageSize, urlPrefix]);

  return res;
};

interface UseCursorPaginationFromUrlProps {
  urlPrefix?: string;
  defaultHistory?: HistoryOptions;
}

export function useCursorPaginationFromUrl({
  urlPrefix = "",
  defaultHistory = "push",
}: UseCursorPaginationFromUrlProps = {}) {
  const [cursorParam, setCursorParam] = useHashParam(
    urlPrefix ? `${urlPrefix}Cursor` : "cursor"
  );

  const cursor = cursorParam || null;

  return useMemo(() => {
    const setCursorPagination = (
      newCursor: string | null,
      history?: HistoryOptions
    ) => {
      if (newCursor !== cursor) {
        setCursorParam(newCursor ?? undefined, {
          history: history ?? defaultHistory,
        });
      }
    };

    return { cursor, setCursorPagination };
  }, [cursor, setCursorParam, defaultHistory]);
}
