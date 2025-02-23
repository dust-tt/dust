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

interface CursorPaginationState {
  cursor: string | null;
  limit: number;
}

interface UseCursorPaginationFromUrlProps {
  urlPrefix?: string;
  initialLimit?: number;
  defaultHistory?: HistoryOptions;
}

export function useCursorPaginationFromUrl({
  urlPrefix = "",
  initialLimit = 25,
  defaultHistory = "push",
}: UseCursorPaginationFromUrlProps = {}) {
  const [cursorParam, setCursorParam] = useHashParam(
    urlPrefix ? `${urlPrefix}Cursor` : "cursor"
  );
  const [limitParam, setLimitParam] = useHashParam(
    urlPrefix ? `${urlPrefix}PageSize` : "pageSize"
  );

  const cursor = cursorParam || null;
  const limit = limitParam ? parseInt(limitParam, 10) : initialLimit;

  return useMemo(() => {
    const cursorPagination: CursorPaginationState = { cursor, limit };

    const setCursorPagination = (
      newValue: CursorPaginationState,
      history?: HistoryOptions
    ) => {
      if (newValue.cursor !== cursor || newValue.limit !== limit) {
        if (newValue.cursor) {
          setCursorParam(newValue.cursor, {
            history: history ?? defaultHistory,
          });
        } else {
          setCursorParam(undefined, {
            history: history ?? defaultHistory,
          });
        }

        if (newValue.limit !== initialLimit) {
          setLimitParam(newValue.limit.toString());
        } else {
          setLimitParam(undefined);
        }
      }
    };

    return { cursorPagination, setCursorPagination };
  }, [
    cursor,
    limit,
    initialLimit,
    setCursorParam,
    defaultHistory,
    setLimitParam,
  ]);
}
