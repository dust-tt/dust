import { PaginationState } from "@tanstack/react-table";
import { useMemo } from "react";

import { useHashParam } from "@sparkle/hooks/useHashParams";

const defaultPageSize = 25;

export const usePaginationFromUrl = ({
  urlPrefix,
  initialPageSize = defaultPageSize,
  history = "push",
}: {
  urlPrefix?: string;
  initialPageSize?: number;
  history?: "push" | "replace";
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

    const setPagination = (newValue: PaginationState) => {
      if (newValue.pageIndex !== pageIndex || newValue.pageSize !== pageSize) {
        setPageIndexParam(newValue.pageIndex.toString(), { history });
        setPageSizeParam(newValue.pageSize.toString());
      }
    };

    return { pagination, setPagination };
  }, [pageIndex, pageSize, urlPrefix]);

  return res;
};
