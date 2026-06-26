import type { RowSelectionState } from "@tanstack/react-table";
import { useCallback, useMemo, useState } from "react";

// Cross-page selection model for a server-paginated table. Either an explicit
// set of selected ids (states "some selected" / "all on this page"), or
// "everything matching the current filter" with an exclude set (state "select
// all across pages, minus a few").
type MembersSelection =
  | { mode: "ids"; ids: Set<string> }
  | { mode: "all"; excludedIds: Set<string> };

// Shape handed to the (future) bulk endpoint: explicit ids, or the active
// filter with per-row exclusions resolved server-side.
export type MembersSelectionDescriptor =
  | { mode: "ids"; userIds: string[] }
  | { mode: "all"; excludeUserIds: string[] };

const EMPTY_SELECTION: MembersSelection = { mode: "ids", ids: new Set() };

export function useMembersSelection({
  pageItemIds,
  totalCount,
  resetKey,
}: {
  // sIds of the rows on the current page.
  pageItemIds: string[];
  // Total number of rows matching the current filter (across all pages).
  totalCount: number;
  // Changes whenever the matching set changes (search / filters). The selection
  // resets when it changes, since the "all matching" set is no longer the same.
  resetKey: string;
}) {
  const [selection, setSelection] = useState<MembersSelection>(EMPTY_SELECTION);

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

  // Per-page selection state DataTable consumes (keyed by the current page's
  // sIds), derived from the cross-page model.
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

  // There are more rows than the current page, so "select all across pages" is
  // a meaningful next step once the whole page is selected.
  const hasMorePagesToSelect =
    isAllOnPageSelected &&
    !isAllAcrossPagesSelected &&
    totalCount > pageItemIds.length;

  // DataTable reports the new selection state for the current page; fold it back
  // into the cross-page model.
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

  const descriptor = useCallback((): MembersSelectionDescriptor => {
    if (selection.mode === "all") {
      return { mode: "all", excludeUserIds: [...selection.excludedIds] };
    }
    return { mode: "ids", userIds: [...selection.ids] };
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
