import type { ItemSelectionState } from "@app/components/data_source_view/update_selection";
import { InfiniteScroll } from "@app/components/InfiniteScroll";
import { NodePathTooltip } from "@app/components/NodePathTooltip";
import { useCursorPaginationForDataTable } from "@app/hooks/useCursorPaginationForDataTable";
import type { NodeCandidate, UrlCandidate } from "@app/lib/connectors";
import {
  getViewTypeForURLNodeCandidateAccountingForNotion,
  isNodeCandidate,
  isUrlCandidate,
} from "@app/lib/connectors";
import {
  getLocationForDataSourceViewContentNode,
  getVisualForDataSourceViewContentNode,
} from "@app/lib/content_nodes";
import { getDisplayTitleForDataSourceViewContentNode } from "@app/lib/providers/content_nodes_display";
import { useSpacesSearch } from "@app/lib/swr/spaces";
import type { ContentNodesViewType } from "@app/types/connectors/content_nodes";
import type { SearchWarningCode } from "@app/types/core/core_api";
import type {
  DataSourceViewContentNode,
  DataSourceViewType,
} from "@app/types/data_source_view";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import type { SpaceType } from "@app/types/space";
import type { LightWorkspaceType } from "@app/types/user";
import {
  AnimatedText,
  Button,
  Checkbox,
  ContentMessage,
  cn,
  Icon,
  InfoCircle,
  Separator,
  Spinner,
  useSheetViewport,
} from "@dust-tt/sparkle";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const PAGE_SIZE = 25;

export type SearchResultsLayoutParts = {
  warning: ReactNode;
  summary: ReactNode;
  list: ReactNode;
};

interface DataSourceSelectionSearchResultsProps {
  owner: LightWorkspaceType;
  space: SpaceType;
  dataSourceViews: DataSourceViewType[];
  viewType: ContentNodesViewType;
  allowAdminSearch?: boolean;
  searchQuery: string;
  nodeOrUrlCandidate: UrlCandidate | NodeCandidate | null;
  filterTranscriptsProcessing?: boolean;
  selectionMode: "checkbox" | "radio";
  getItemSelectionState: (
    item: DataSourceViewContentNode
  ) => ItemSelectionState;
  isItemCheckboxDisabled: (item: DataSourceViewContentNode) => boolean;
  onToggleSelection: (item: DataSourceViewContentNode) => void;
  onSelectAll?: () => void;
  displaySelectAllButton?: boolean;
  renderLayout?: (parts: SearchResultsLayoutParts) => ReactNode;
}

function SearchWarningMessage({
  warningCode,
}: {
  warningCode: SearchWarningCode;
}) {
  switch (warningCode) {
    case "truncated-query-clauses":
      return (
        <ContentMessage
          title="Search results are partial due to the large amount of data."
          variant="golden"
          icon={InfoCircle}
          className="w-full"
          size="lg"
        />
      );
    default:
      assertNeverAndIgnore(warningCode);
      return null;
  }
}

function SearchResultRow({
  node,
  owner,
  selectionMode,
  selectionState,
  checkboxDisabled,
  onToggleSelection,
}: {
  node: DataSourceViewContentNode;
  owner: LightWorkspaceType;
  selectionMode: "checkbox" | "radio";
  selectionState: ItemSelectionState;
  checkboxDisabled: boolean;
  onToggleSelection: (item: DataSourceViewContentNode) => void;
}) {
  const Visual = getVisualForDataSourceViewContentNode(node);
  const location =
    node.dataSourceView.category === "folder"
      ? node.dataSourceView.dataSource.name
      : getLocationForDataSourceViewContentNode(node);

  return (
    <NodePathTooltip node={node} owner={owner}>
      <div
        role="button"
        tabIndex={checkboxDisabled ? -1 : 0}
        aria-disabled={checkboxDisabled}
        onClick={() => {
          if (!checkboxDisabled) {
            onToggleSelection(node);
          }
        }}
        onKeyDown={(event) => {
          if (
            !checkboxDisabled &&
            (event.key === "Enter" || event.key === " ")
          ) {
            event.preventDefault();
            onToggleSelection(node);
          }
        }}
        className={cn(
          "flex w-full items-center gap-3 p-3 text-left hover:bg-muted/60 hover:dark:bg-muted/10",
          checkboxDisabled ? "cursor-default" : "cursor-pointer"
        )}
      >
        <Checkbox
          checked={selectionState}
          disabled={checkboxDisabled}
          className={selectionMode === "radio" ? "rounded-full" : undefined}
          onCheckedChange={() => onToggleSelection(node)}
          onClick={(event) => event.stopPropagation()}
        />
        <Icon size="sm" visual={Visual} />
        <div className="min-w-0 flex-1 truncate text-sm text-foreground dark:text-foreground-night">
          {getDisplayTitleForDataSourceViewContentNode(node, {
            disambiguate: true,
          })}
        </div>
        <div className="hidden min-w-0 flex-1 truncate text-sm text-muted-foreground dark:text-muted-foreground-night sm:block">
          {location}
        </div>
      </div>
    </NodePathTooltip>
  );
}

function defaultRenderLayout({
  warning,
  summary,
  list,
}: SearchResultsLayoutParts) {
  return (
    <div className="flex w-full flex-col gap-2">
      {warning}
      {summary}
      {list}
    </div>
  );
}

function ScrollSearchToTop() {
  const sheetViewport = useSheetViewport();

  useEffect(() => {
    sheetViewport?.scrollTo({ top: 0 });
  }, [sheetViewport]);

  return null;
}

export function DataSourceSelectionSearchResults({
  owner,
  space,
  dataSourceViews,
  viewType,
  allowAdminSearch = false,
  searchQuery,
  nodeOrUrlCandidate,
  filterTranscriptsProcessing = false,
  selectionMode,
  getItemSelectionState,
  isItemCheckboxDisabled,
  onToggleSelection,
  onSelectAll,
  displaySelectAllButton = false,
  renderLayout = defaultRenderLayout,
}: DataSourceSelectionSearchResultsProps) {
  const [accumulatedResults, setAccumulatedResults] = useState<
    DataSourceViewContentNode[]
  >([]);
  const [stableResultsCount, setStableResultsCount] = useState<number | null>(
    null
  );
  const stableHasMoreRef = useRef(false);
  const isLoadingMoreRef = useRef(false);

  const {
    cursorPagination,
    resetPagination,
    handlePaginationChange,
    tablePagination,
  } = useCursorPaginationForDataTable(PAGE_SIZE);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset pagination when search query changes
  useEffect(() => {
    resetPagination();
    setAccumulatedResults([]);
    setStableResultsCount(null);
    stableHasMoreRef.current = false;
  }, [searchQuery, resetPagination]);

  const commonSearchParams = {
    owner,
    spaceIds: [space.sId],
    disabled: !searchQuery,
    pagination: { cursor: cursorPagination.cursor, limit: PAGE_SIZE },
    dataSourceViewIdsBySpaceId:
      dataSourceViews.length > 0
        ? {
            [space.sId]: dataSourceViews.map((dsv) => dsv.sId),
          }
        : undefined,
    allowAdminSearch,
  };

  const {
    searchResultNodes: rawSearchResultNodes,
    isSearchLoading,
    isSearchValidating,
    nextPageCursor,
    resultsCount,
    warningCode,
  } = useSpacesSearch(
    isNodeCandidate(nodeOrUrlCandidate) && nodeOrUrlCandidate.node
      ? {
          ...commonSearchParams,
          nodeIds: [nodeOrUrlCandidate.node],
          includeDataSources: false,
          viewType: getViewTypeForURLNodeCandidateAccountingForNotion(
            viewType,
            nodeOrUrlCandidate.node
          ),
        }
      : {
          ...commonSearchParams,
          search: searchQuery,
          searchSourceUrls: isUrlCandidate(nodeOrUrlCandidate),
          includeDataSources: true,
          viewType,
        }
  );

  const processedPageResults = useMemo(() => {
    const processedResults = rawSearchResultNodes.flatMap((node) => {
      const { dataSourceViews: nodeViews, ...rest } = node;
      const filteredViews = nodeViews.filter((view) =>
        dataSourceViews.some((dsv) => dsv.sId === view.sId)
      );
      return filteredViews.map((view) => ({
        ...rest,
        dataSourceView: view,
      }));
    });

    if (filterTranscriptsProcessing) {
      return processedResults.filter((node) => !node.dataSource.connectorId);
    }

    return nodeOrUrlCandidate && !isNodeCandidate(nodeOrUrlCandidate)
      ? processedResults.filter(
          (node) => node.sourceUrl === nodeOrUrlCandidate.url
        )
      : processedResults;
  }, [
    rawSearchResultNodes,
    dataSourceViews,
    nodeOrUrlCandidate,
    filterTranscriptsProcessing,
  ]);

  // Accumulate paginated search results across pages.
  useEffect(() => {
    if (tablePagination.pageIndex === 0) {
      setAccumulatedResults(processedPageResults);
    } else if (processedPageResults.length > 0) {
      setAccumulatedResults((prev) => {
        const existingIds = new Set(
          prev.map((node) => `${node.dataSourceView.sId}:${node.internalId}`)
        );
        const newNodes = processedPageResults.filter(
          (node) =>
            !existingIds.has(`${node.dataSourceView.sId}:${node.internalId}`)
        );
        return [...prev, ...newNodes];
      });
    }
  }, [processedPageResults, tablePagination.pageIndex]);

  const loadedCount = accumulatedResults.length;

  useEffect(() => {
    if (resultsCount !== null) {
      setStableResultsCount(resultsCount);
    }
    if (nextPageCursor !== null) {
      stableHasMoreRef.current = true;
    } else if (!isSearchValidating) {
      stableHasMoreRef.current = false;
    }
  }, [resultsCount, nextPageCursor, isSearchValidating]);

  const displayResultsCount = resultsCount ?? stableResultsCount;
  const hasMore =
    nextPageCursor !== null || (isSearchValidating && stableHasMoreRef.current);
  const isLoading = isSearchLoading || isSearchValidating;
  isLoadingMoreRef.current = isSearchValidating;
  const isSearchPending =
    searchQuery.length > 0 &&
    displayResultsCount === null &&
    loadedCount === 0 &&
    isLoading;

  const handleLoadMore = useCallback(() => {
    if (!nextPageCursor || isLoadingMoreRef.current) {
      return;
    }

    handlePaginationChange(
      {
        pageIndex: tablePagination.pageIndex + 1,
        pageSize: PAGE_SIZE,
      },
      nextPageCursor
    );
  }, [nextPageCursor, handlePaginationChange, tablePagination.pageIndex]);

  const summaryLabel = useMemo(() => {
    if (displayResultsCount === 0 && !isSearchPending) {
      return "0 results found";
    }

    const displayTotal = displayResultsCount ?? 0;
    const resultLabel = displayTotal === 1 ? "result" : "results";
    const base = `Showing ${loadedCount} of ${displayTotal} ${resultLabel}`;
    return hasMore ? `${base} · scroll for more` : base;
  }, [displayResultsCount, hasMore, isSearchPending, loadedCount]);

  const warning = warningCode ? (
    <SearchWarningMessage warningCode={warningCode} />
  ) : null;

  const summary = (
    <div className="flex items-center justify-between text-sm text-muted-foreground dark:text-muted-foreground-night">
      <span className="min-h-5">
        {isSearchPending ? (
          <AnimatedText variant="muted">{summaryLabel}</AnimatedText>
        ) : (
          summaryLabel
        )}
      </span>
      {displaySelectAllButton && onSelectAll && loadedCount > 0 && (
        <Button
          variant="ghost"
          size="xs"
          label="Select all"
          onClick={onSelectAll}
        />
      )}
    </div>
  );

  if (displayResultsCount === 0 && !isSearchPending && loadedCount === 0) {
    return renderLayout({
      warning,
      summary: (
        <div className="text-end text-sm text-muted-foreground dark:text-muted-foreground-night">
          0 results found
        </div>
      ),
      list: (
        <div className="flex items-center justify-center p-8 text-center">
          <p className="text-sm text-muted-foreground dark:text-muted-foreground-night">
            No matching results found. Try different search terms.
          </p>
        </div>
      ),
    });
  }

  const list = (
    <div
      className={
        isSearchPending && loadedCount === 0
          ? "pointer-events-none opacity-50"
          : undefined
      }
    >
      <ScrollSearchToTop />
      <div className="flex items-center gap-3 p-3 text-sm font-medium text-muted-foreground dark:text-muted-foreground-night">
        <div className="w-5" />
        <div className="min-w-0 flex-1">Name</div>
        <div className="hidden min-w-0 flex-1 truncate sm:block">Location</div>
      </div>
      <Separator />
      {accumulatedResults.map((node) => {
        const itemId = `${node.dataSourceView.sId}:${node.internalId}`;

        return (
          <div key={itemId}>
            <SearchResultRow
              node={node}
              owner={owner}
              selectionMode={selectionMode}
              selectionState={getItemSelectionState(node)}
              checkboxDisabled={isItemCheckboxDisabled(node)}
              onToggleSelection={onToggleSelection}
            />
            <Separator />
          </div>
        );
      })}
      <InfiniteScroll
        nextPage={handleLoadMore}
        hasMore={hasMore}
        showLoader={isLoading && loadedCount > 0}
        loader={
          <div className="flex justify-center py-4">
            <Spinner size="sm" />
          </div>
        }
        options={{
          rootMargin: "0px 0px 100px 0px",
          threshold: 0,
        }}
      />
    </div>
  );

  return renderLayout({ warning, summary, list });
}
