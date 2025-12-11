import { useCallback, useEffect, useRef, useState } from "react";

import type { ToolSearchResult } from "@app/lib/search/tools/types";
import { emptyArray } from "@app/lib/swr/swr";
import type {
  ContentNodeWithParent,
  DataSourceType,
  DataSourceViewType,
  LightWorkspaceType,
  SearchWarningCode,
} from "@app/types";

export type DataSourceContentNode = ContentNodeWithParent & {
  dataSource: DataSourceType;
  dataSourceViews: DataSourceViewType[];
};

interface UnifiedSearchStreamChunk {
  knowledgeResults?: {
    nodes: DataSourceContentNode[];
    nextPageCursor: string | null;
    resultsCount: number | null;
    warningCode: SearchWarningCode | null;
  };
  toolResults?: ToolSearchResult[];
  done?: boolean;
  totalToolCount?: number;
}

export function useUnifiedSearch({
  owner,
  query,
  pageSize = 25,
  disabled = false,
  spaceIds,
  viewType = "all",
  includeDataSources = true,
  searchSourceUrls = false,
  includeTools = true,
}: {
  owner: LightWorkspaceType;
  query: string;
  pageSize?: number;
  disabled?: boolean;
  spaceIds?: string[];
  viewType?: "table" | "document" | "all";
  includeDataSources?: boolean;
  searchSourceUrls?: boolean;
  includeTools?: boolean;
}) {
  const [knowledgeResults, setKnowledgeResults] = useState<
    DataSourceContentNode[]
  >([]);
  const [toolResults, setToolResults] = useState<ToolSearchResult[]>([]);
  const [knowledgeResultsCount, setKnowledgeResultsCount] = useState<
    number | null
  >(null);
  const [toolResultsCount, setToolResultsCount] = useState(0);
  const [nextPageCursor, setNextPageCursor] = useState<string | null>(null);
  const [warningCode, setWarningCode] = useState<SearchWarningCode | null>(
    null
  );
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [isLoadingNextPage, setIsLoadingNextPage] = useState(false);
  const [isSearchError, setIsSearchError] = useState<Error | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const isInitialLoad = useRef(true);

  const loadPage = useCallback(
    (cursor?: string | null, appendResults = false) => {
      // Close any existing EventSource
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }

      // Don't start a new search if disabled or query too short
      if (disabled || !query || query.length < 1) {
        setIsSearchLoading(false);
        setIsLoadingNextPage(false);
        return;
      }

      if (appendResults) {
        setIsLoadingNextPage(true);
      } else {
        setIsSearchLoading(true);
      }

      // Build query parameters
      const params = new URLSearchParams();
      params.append("query", query);
      params.append("limit", pageSize.toString()); // Use 'limit' not 'pageSize' for pagination
      params.append("viewType", viewType);
      params.append("includeDataSources", includeDataSources.toString());
      // Only include tools on the first page
      params.append(
        "includeTools",
        (!appendResults && includeTools).toString()
      );
      if (searchSourceUrls) {
        params.append("searchSourceUrls", "true");
      }
      if (spaceIds && spaceIds.length > 0) {
        params.append("spaceIds", spaceIds.join(","));
      }
      if (cursor) {
        params.append("cursor", cursor);
      }

      const url = `/api/w/${owner.sId}/search?${params.toString()}`;
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      const accumulatedToolResults: ToolSearchResult[] = [];

      eventSource.onmessage = (event) => {
        try {
          const chunk: UnifiedSearchStreamChunk = JSON.parse(event.data);

          if (chunk.knowledgeResults) {
            // Handle knowledge results
            const { knowledgeResults } = chunk;
            if (appendResults) {
              setKnowledgeResults((prev) => [
                ...prev,
                ...knowledgeResults.nodes,
              ]);
            } else {
              setKnowledgeResults(knowledgeResults.nodes);
            }
            setKnowledgeResultsCount(knowledgeResults.resultsCount);
            setNextPageCursor(knowledgeResults.nextPageCursor);
            setWarningCode(knowledgeResults.warningCode);
          }

          if (chunk.toolResults && !appendResults) {
            // Only accumulate tool results on initial load
            accumulatedToolResults.push(...chunk.toolResults);
            setToolResults([...accumulatedToolResults]);
            setToolResultsCount(accumulatedToolResults.length);
          }

          if (chunk.done) {
            // Final message
            if (!appendResults) {
              setToolResultsCount(chunk.totalToolCount ?? 0);
            }
            setIsSearchLoading(false);
            setIsLoadingNextPage(false);
            eventSource.close();
          }
        } catch (error) {
          setIsSearchError(
            error instanceof Error ? error : new Error("Failed to parse stream")
          );
          setIsSearchLoading(false);
          setIsLoadingNextPage(false);
          eventSource.close();
        }
      };

      eventSource.onerror = () => {
        setIsSearchError(new Error("Failed to fetch search results"));
        setIsSearchLoading(false);
        setIsLoadingNextPage(false);
        eventSource.close();
      };
    },
    [
      disabled,
      query,
      pageSize,
      viewType,
      includeDataSources,
      includeTools,
      searchSourceUrls,
      spaceIds,
      owner.sId,
    ]
  );

  const nextPage = useCallback(async () => {
    if (nextPageCursor && !isLoadingNextPage) {
      loadPage(nextPageCursor, true);
    }
  }, [nextPageCursor, isLoadingNextPage, loadPage]);

  useEffect(() => {
    setKnowledgeResults([]);
    setToolResults([]);
    setKnowledgeResultsCount(null);
    setToolResultsCount(0);
    setNextPageCursor(null);
    setWarningCode(null);
    setIsSearchError(null);
    isInitialLoad.current = true;

    loadPage(null, false);

    // Cleanup function
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }
    };
  }, [loadPage]);

  return {
    knowledgeResults:
      knowledgeResults.length > 0
        ? knowledgeResults
        : emptyArray<DataSourceContentNode>(),
    toolResults:
      toolResults.length > 0 ? toolResults : emptyArray<ToolSearchResult>(),
    knowledgeResultsCount,
    toolResultsCount,
    nextPageCursor,
    warningCode,
    hasMore: nextPageCursor !== null,
    nextPage,
    isSearchLoading,
    isLoadingNextPage,
    isSearchValidating: false, // No validation with streaming
    isSearchError,
  };
}
