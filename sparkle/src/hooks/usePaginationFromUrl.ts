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
  pageSize: number;
}

interface UseCursorPaginationFromUrlProps {
  urlPrefix?: string;
  initialPageSize?: number;
  defaultHistory?: HistoryOptions;
}

export function useCursorPaginationFromUrl({
  urlPrefix = "",
  initialPageSize = 25,
  defaultHistory = "push",
}: UseCursorPaginationFromUrlProps = {}) {
  const [cursorParam, setCursorParam] = useHashParam(
    urlPrefix ? `${urlPrefix}Cursor` : "cursor"
  );
  const [pageSizeParam, setPageSizeParam] = useHashParam(
    urlPrefix ? `${urlPrefix}PageSize` : "pageSize"
  );

  const cursor = cursorParam || null;
  const pageSize = pageSizeParam ? parseInt(pageSizeParam) : initialPageSize;

  return useMemo(() => {
    const pagination: CursorPaginationState = { cursor, pageSize };

    const setPagination = (
      newValue: CursorPaginationState,
      history?: HistoryOptions
    ) => {
      if (newValue.cursor !== cursor || newValue.pageSize !== pageSize) {
        if (newValue.cursor) {
          setCursorParam(newValue.cursor, {
            history: history ?? defaultHistory,
          });
        } else {
          setCursorParam(undefined, {
            history: history ?? defaultHistory,
          });
        }

        if (newValue.pageSize !== initialPageSize) {
          setPageSizeParam(newValue.pageSize.toString());
        } else {
          setPageSizeParam(undefined);
        }
      }
    };

    return { pagination, setPagination };
  }, [
    cursor,
    pageSize,
    initialPageSize,
    setCursorParam,
    setPageSizeParam,
    defaultHistory,
  ]);
}
