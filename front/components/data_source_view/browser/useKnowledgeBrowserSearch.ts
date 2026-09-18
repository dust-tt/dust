import { getKnowledgeBrowserEntryLabel } from "@app/components/data_source_view/browser/knowledgeBrowserItems";
import type { KnowledgeBrowserSearchScope } from "@app/components/data_source_view/browser/knowledgeBrowserSearch";
import {
  getKnowledgeBrowserSearchScope,
  toDataSourceViewContentNodes,
} from "@app/components/data_source_view/browser/knowledgeBrowserSearch";
import type { NavigationHistoryEntryType } from "@app/components/data_source_view/context/types";
import {
  findCategoryFromNavigationHistory,
  findSpaceFromNavigationHistory,
} from "@app/components/data_source_view/context/utils";
import { useDebouncedValue } from "@app/hooks/useDebounce";
import { useSpaceDataSourceViews, useSpacesSearch } from "@app/lib/swr/spaces";
import { emptyArray } from "@app/lib/swr/swr";
import type { ContentNodesViewType } from "@app/types/connectors/content_nodes";
import { MIN_SEARCH_QUERY_SIZE } from "@app/types/core/utils";
import type { DataSourceViewContentNode } from "@app/types/data_source_view";
import type { LightWorkspaceType } from "@app/types/user";
import { useMemo } from "react";

// The scoped search is a plain request per query, so it waits for typing to settle.
const SCOPED_SEARCH_DEBOUNCE_MS = 300;
// One page is enough: a long scoped list is a hint to browse one level deeper instead.
const SCOPED_SEARCH_LIMIT = 10;

interface UseKnowledgeBrowserSearchParams {
  owner: LightWorkspaceType;
  navigationHistory: NavigationHistoryEntryType[];
  query: string;
  viewType: ContentNodesViewType;
  enabled: boolean;
}

interface UseKnowledgeBrowserSearchResult {
  scope: KnowledgeBrowserSearchScope | null;
  scopeLabel: string;
  results: DataSourceViewContentNode[];
  isLoading: boolean;
}

/**
 * @cc [owner:smb2268,label:react] scoped-search-runs-only-in-scope
 * A request MUST be sent only when `enabled`, the navigation history is below the root, the
 * debounced query reaches `MIN_SEARCH_QUERY_SIZE`, and the scope has at least one view to search;
 * otherwise `results` is empty and `isLoading` is false. `isLoading` covers the debounce wait as
 * well as the request.
 */
export function useKnowledgeBrowserSearch({
  owner,
  navigationHistory,
  query,
  viewType,
  enabled,
}: UseKnowledgeBrowserSearchParams): UseKnowledgeBrowserSearchResult {
  const entry = navigationHistory[navigationHistory.length - 1];
  const space = findSpaceFromNavigationHistory(navigationHistory);
  const category = findCategoryFromNavigationHistory(navigationHistory);

  // Only the category level needs the space's views to name its scope.
  const { spaceDataSourceViews } = useSpaceDataSourceViews({
    workspaceId: owner.sId,
    spaceId: space?.sId ?? "",
    category: category ?? undefined,
    disabled: !enabled || entry.type !== "category" || !space,
  });

  const scope = useMemo(
    () =>
      enabled
        ? getKnowledgeBrowserSearchScope(
            navigationHistory,
            spaceDataSourceViews
          )
        : null,
    [enabled, navigationHistory, spaceDataSourceViews]
  );

  const trimmedQuery = query.trim();
  const { debouncedValue: debouncedQuery, isDebouncing } = useDebouncedValue(
    trimmedQuery,
    SCOPED_SEARCH_DEBOUNCE_MS
  );
  const hasQuery = trimmedQuery.length >= MIN_SEARCH_QUERY_SIZE;
  const hasSearchableScope =
    scope !== null &&
    (scope.dataSourceViewIds === undefined ||
      scope.dataSourceViewIds.length > 0);
  const canSearch =
    hasSearchableScope && debouncedQuery.length >= MIN_SEARCH_QUERY_SIZE;

  const { searchResultNodes, isSearchLoading } = useSpacesSearch({
    owner,
    spaceIds: scope ? [scope.spaceId] : [],
    search: canSearch ? debouncedQuery : "",
    viewType,
    includeDataSources: false,
    dataSourceViewIdsBySpaceId:
      scope?.dataSourceViewIds !== undefined
        ? { [scope.spaceId]: scope.dataSourceViewIds }
        : undefined,
    parentId: scope?.parentId,
    pagination: { limit: SCOPED_SEARCH_LIMIT, cursor: null },
    disabled: !canSearch,
  });

  const results = useMemo(
    () =>
      canSearch && scope
        ? toDataSourceViewContentNodes(searchResultNodes, scope.spaceId)
        : emptyArray<DataSourceViewContentNode>(),
    [canSearch, scope, searchResultNodes]
  );

  return {
    scope,
    scopeLabel: getKnowledgeBrowserEntryLabel(entry),
    results,
    isLoading:
      hasSearchableScope && hasQuery && (isDebouncing || isSearchLoading),
  };
}
