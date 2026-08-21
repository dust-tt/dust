import type { RowSelectionState } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";

type TableRowsSelection =
  | { mode: "ids"; ids: Set<string> }
  | { mode: "all"; excludedIds: Set<string> };

export type TableRowsSelectionDescriptor =
  | { mode: "ids"; ids: string[] }
  | { mode: "all"; excludedIds: string[] };

const EMPTY_SELECTION: TableRowsSelection = { mode: "ids", ids: new Set() };

export function useTableRowsSelection({
  pageItemIds,
  totalCount,
  resetKey,
}: {
  pageItemIds: string[];
  totalCount: number;
  resetKey: string;
}) {
  const [selection, setSelection] =
    useState<TableRowsSelection>(EMPTY_SELECTION);

  // Reset during render when the filter identity changes (the React-recommended
  // alternative to an effect for adjusting state on input change).
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    setSelection(EMPTY_SELECTION);
  }

  const selectedCount =
    selection.mode === "ids"
      ? selection.ids.size
      : Math.max(0, totalCount - selection.excludedIds.size);

  const rowSelection: RowSelectionState = useMemo(() => {
    const state: RowSelectionState = {};
    for (const id of pageItemIds) {
      state[id] =
        selection.mode === "ids"
          ? selection.ids.has(id)
          : !selection.excludedIds.has(id);
    }
    return state;
  }, [pageItemIds, selection]);

  const isAllOnPageSelected =
    pageItemIds.length > 0 && pageItemIds.every((id) => rowSelection[id]);

  const isAllAcrossPagesSelected = selection.mode === "all";

  const hasMorePagesToSelect =
    isAllOnPageSelected &&
    !isAllAcrossPagesSelected &&
    totalCount > pageItemIds.length;

  const onRowSelectionChange = useCallback(
    (next: RowSelectionState) => {
      setSelection((prev) => {
        if (prev.mode === "all") {
          const excludedIds = new Set(prev.excludedIds);
          for (const id of pageItemIds) {
            if (next[id]) {
              excludedIds.delete(id);
            } else {
              excludedIds.add(id);
            }
          }
          return { mode: "all", excludedIds };
        }
        const ids = new Set(prev.ids);
        for (const id of pageItemIds) {
          if (next[id]) {
            ids.add(id);
          } else {
            ids.delete(id);
          }
        }
        return { mode: "ids", ids };
      });
    },
    [pageItemIds]
  );

  const selectAllAcrossPages = useCallback(() => {
    setSelection({ mode: "all", excludedIds: new Set() });
  }, []);

  const clearSelection = useCallback(() => {
    setSelection(EMPTY_SELECTION);
  }, []);

  const descriptor = useCallback((): TableRowsSelectionDescriptor => {
    if (selection.mode === "all") {
      return { mode: "all", excludedIds: [...selection.excludedIds] };
    }
    return { mode: "ids", ids: [...selection.ids] };
  }, [selection]);

  return {
    rowSelection,
    onRowSelectionChange,
    selectedCount,
    isAllOnPageSelected,
    isAllAcrossPagesSelected,
    hasMorePagesToSelect,
    selectAllAcrossPages,
    clearSelection,
    descriptor,
  };
}
