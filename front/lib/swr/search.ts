import { useCallback, useEffect, useRef, useState } from "react";

import type { ToolSearchResult } from "@app/lib/search/tools/types";
import { emptyArray } from "@app/lib/swr/swr";
import type {
  ContentNodeWithParent,
  DataSourceType,
  DataSourceViewType,
  LightWorkspaceType,
} from "@app/types";

export type DataSourceViewContentNode = ContentNodeWithParent & {
  dataSource: DataSourceType;
  dataSourceViews: DataSourceViewType[];
};

interface UnifiedSearchStreamChunk {
  knowledgeResults?: {
    nodes: DataSourceViewContentNode[];
    warningCode: string | null;
    nextPageCursor: string | null;
    resultsCount: number | null;
  };
  toolResults?: ToolSearchResult[];
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
  viewType?: "all" | "documents" | "tables";
  includeDataSources?: boolean;
  searchSourceUrls?: boolean;
  includeTools?: boolean;
}) {
  const [knowledgeResults, setKnowledgeResults] = useState<
    DataSourceViewContentNode[]
  >([]);
  const [toolResults, setToolResults] = useState<ToolSearchResult[]>([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [isLoadingNextPage, setIsLoadingNextPage] = useState(false);
  const [isSearchValidating, setIsSearchValidating] = useState(false);
  const [isSearchError, setIsSearchError] = useState<Error | null>(null);
  const [nextPageCursor, setNextPageCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const loadPage = useCallback(
    (cursor?: string | null, appendResults = false) => {
      if (disabled || !query || query.length < 3) {
        setIsSearchLoading(false);
        setIsLoadingNextPage(false);
        return;
      }

      if (appendResults) {
        setIsLoadingNextPage(true);
      } else {
        setIsSearchLoading(true);
      }

      const params = new URLSearchParams();
      params.append("query", query);
      params.append("limit", pageSize.toString());
      params.append("viewType", viewType);
      params.append("includeDataSources", includeDataSources.toString());
      params.append("searchSourceUrls", searchSourceUrls.toString());
      // Only include tools on first page
      params.append("includeTools", (!appendResults && includeTools).toString());

      if (spaceIds && spaceIds.length > 0) {
        params.append("spaceIds", spaceIds.join(","));
      }

      if (cursor) {
        params.append("cursor", cursor);
      }

      const url = `/api/w/${owner.sId}/search?${params.toString()}`;
      const eventSource = new EventSource(url);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        setIsSearchValidating(true);
      };

      eventSource.onmessage = (event) => {
        try {
          const chunk: UnifiedSearchStreamChunk = JSON.parse(event.data);

          if (chunk.knowledgeResults) {
            const { knowledgeResults } = chunk;
            if (appendResults) {
              setKnowledgeResults((prev) => [
                ...prev,
                ...knowledgeResults.nodes,
              ]);
            } else {
              setKnowledgeResults(knowledgeResults.nodes);
            }
            setNextPageCursor(knowledgeResults.nextPageCursor);
            setHasMore(!!knowledgeResults.nextPageCursor);
          }

          if (chunk.toolResults) {
            // Tool results only come on first page
            const { toolResults } = chunk;
            setToolResults((prev) => [...prev, ...toolResults]);
          }

          setIsSearchValidating(false);
        } catch (error) {
          setIsSearchError(
            error instanceof Error ? error : new Error("Failed to parse stream")
          );
          setIsSearchLoading(false);
          setIsLoadingNextPage(false);
          setIsSearchValidating(false);
          eventSource.close();
        }
      };

      eventSource.onerror = () => {
        setIsSearchError(new Error("Failed to fetch search results"));
        setIsSearchLoading(false);
        setIsLoadingNextPage(false);
        setIsSearchValidating(false);
        eventSource.close();
      };

      // When streaming completes
      const checkCompletion = () => {
        setIsSearchLoading(false);
        setIsLoadingNextPage(false);
        setIsSearchValidating(false);
        eventSource.close();
      };

      // Set a timeout to close the connection after receiving initial results
      setTimeout(() => {
        if (eventSource.readyState === EventSource.OPEN) {
          checkCompletion();
        }
      }, 5000);
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

  useEffect(() => {
    setKnowledgeResults([]);
    setToolResults([]);
    setNextPageCursor(null);
    setHasMore(false);
    setIsSearchError(null);

    // Close any existing EventSource
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    // Load first page
    loadPage();

    // Cleanup function
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [loadPage]);

  const nextPage = useCallback(async () => {
    if (nextPageCursor && !isLoadingNextPage) {
      loadPage(nextPageCursor, true);
    }
  }, [nextPageCursor, isLoadingNextPage, loadPage]);

  return {
    knowledgeResults:
      knowledgeResults.length > 0
        ? knowledgeResults
        : emptyArray<DataSourceViewContentNode>(),
    toolResults:
      toolResults.length > 0 ? toolResults : emptyArray<ToolSearchResult>(),
    isSearchLoading,
    isLoadingNextPage,
    isSearchValidating,
    isSearchError,
    hasMore,
    nextPage,
  };
}
