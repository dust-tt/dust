import { useCallback, useEffect, useRef, useState } from "react";

import { getApiBaseUrl } from "@app/lib/egress/client";
import type { ToolSearchResult } from "@app/lib/search/tools/types";
import { emptyArray } from "@app/lib/swr/swr";
import type { ContentNodeWithParent } from "@app/types/connectors/connectors_api";
import type { ContentNodesViewType } from "@app/types/connectors/content_nodes";
import type { DataSourceType } from "@app/types/data_source";
import type { DataSourceViewType } from "@app/types/data_source_view";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";

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
  prioritizeSpaceAccess = false,
}: {
  owner: LightWorkspaceType;
  query: string;
  pageSize?: number;
  disabled?: boolean;
  spaceIds?: string[];
  viewType?: Exclude<ContentNodesViewType, "data_warehouse">;
  includeDataSources?: boolean;
  searchSourceUrls?: boolean;
  includeTools?: boolean;
  prioritizeSpaceAccess?: boolean;
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
      if (disabled) {
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
      params.append("prioritizeSpaceAccess", prioritizeSpaceAccess.toString());
      // Only include tools on first page
      params.append(
        "includeTools",
        (!appendResults && includeTools).toString()
      );

      if (spaceIds && spaceIds.length > 0) {
        params.append("spaceIds", spaceIds.join(","));
      }

      if (cursor) {
        params.append("cursor", cursor);
      }

      const url = `${getApiBaseUrl()}/api/w/${owner.sId}/search?${params.toString()}`;
      const eventSource = new EventSource(url, { withCredentials: true });
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
          setIsSearchError(normalizeError(error));
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
    },
    [
      disabled,
      includeDataSources,
      includeTools,
      owner.sId,
      pageSize,
      prioritizeSpaceAccess,
      query,
      searchSourceUrls,
      spaceIds,
      viewType,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    disabled,
    includeDataSources,
    includeTools,
    owner.sId,
    pageSize,
    prioritizeSpaceAccess,
    query,
    searchSourceUrls,
    // Serialize spaceIds to compare by value, not reference
    // eslint-disable-next-line react-hooks/exhaustive-deps
    spaceIds?.join(","),
    viewType,
  ]);

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
