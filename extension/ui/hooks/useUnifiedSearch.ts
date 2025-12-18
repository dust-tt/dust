import { useDustAPI } from "@app/shared/lib/dust_api";
import type {
  CustomResourceIconType,
  InternalAllowedIconType,
} from "@app/shared/lib/resources_icons";
import { getSpaceAccessPriority } from "@app/shared/lib/spaces";
import { useSpaces } from "@app/ui/hooks/useSpaces";
import type {
  ContentNodesViewType,
  ContentNodeType,
  DataSourceContentNodeType,
  DataSourceViewContentNodeType,
} from "@dust-tt/client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface ToolSearchResult {
  internalId: string;
  externalId: string;
  title: string;
  type: ContentNodeType["type"];
  mimeType: string;
  serverName: string;
  serverIcon: InternalAllowedIconType | CustomResourceIconType;
  serverViewId: string;
  sourceUrl: string | null;
  url?: string;
  score?: number;
}

export type DataSourceViewContentNode = DataSourceViewContentNodeType;

export function useUnifiedSearch({
  query,
  pageSize = 25,
  disabled = false,
  spaceIds,
  viewType = "all",
  includeDataSources = true,
  searchSourceUrls = false,
  includeTools = true,
}: {
  query: string;
  pageSize?: number;
  disabled?: boolean;
  spaceIds?: string[];
  viewType?: ContentNodesViewType;
  includeDataSources?: boolean;
  searchSourceUrls?: boolean;
  includeTools?: boolean;
}) {
  const dustAPI = useDustAPI();
  const { spaces } = useSpaces();
  const [rawKnowledgeResults, setRawKnowledgeResults] = useState<
    DataSourceContentNodeType[]
  >([]);
  const [toolResults, setToolResults] = useState<ToolSearchResult[]>([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [isLoadingNextPage, setIsLoadingNextPage] = useState(false);
  const [isSearchValidating, setIsSearchValidating] = useState(false);
  const [isSearchError, setIsSearchError] = useState<Error | null>(null);
  const [nextPageCursor, setNextPageCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const spacesMap = useMemo(
    () => Object.fromEntries(spaces.map((space) => [space.sId, space])),
    [spaces]
  );

  // Transform raw nodes to pick a single dataSourceView based on space priority
  const knowledgeResults = useMemo(() => {
    return rawKnowledgeResults
      .map((node): DataSourceViewContentNode | null => {
        const { dataSourceViews, ...contentNodeFields } = node;

        // Find the best dataSourceView based on space priority
        const viewWithPriority = dataSourceViews
          .filter((view) => spacesMap[view.spaceId])
          .map((view) => ({
            view,
            spaceName: spacesMap[view.spaceId]?.name || "",
            spacePriority: getSpaceAccessPriority(spacesMap[view.spaceId]),
          }))
          .sort(
            (a, b) =>
              b.spacePriority - a.spacePriority ||
              a.spaceName.localeCompare(b.spaceName)
          )[0];

        if (!viewWithPriority) {
          return null;
        }

        // Construct the proper DataSourceViewContentNode
        // The SSE stream returns a simplified dataSourceView, but we cast it
        // to the full type since the component only uses the fields that are present
        return {
          ...contentNodeFields,
          dataSourceView: viewWithPriority.view as any,
        } as DataSourceViewContentNode;
      })
      .filter((node): node is DataSourceViewContentNode => node !== null);
  }, [rawKnowledgeResults, spacesMap]);

  const loadPage = useCallback(
    async (cursor?: string | null, appendResults = false) => {
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

      // Create abort controller for this request
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      try {
        setIsSearchValidating(true);

        // Use the DustAPI searchUnified which now returns a Result
        const result = await dustAPI.searchUnified({
          query,
          limit: pageSize,
          cursor,
          viewType: viewType as "all" | "documents" | "tables",
          spaceIds,
          includeDataSources,
          searchSourceUrls,
          // Only include tools on first page
          includeTools: !appendResults && includeTools,
        });

        // Check if the request failed
        if (result.isErr()) {
          throw new Error(result.error.message);
        }

        // Get the event stream from the result
        const { eventStream } = result.value;

        // Process each chunk from the stream
        for await (const chunk of eventStream) {
          // Check if aborted
          if (abortController.signal.aborted) {
            break;
          }

          if (chunk.knowledgeResults) {
            const { knowledgeResults } = chunk;
            if (appendResults) {
              setRawKnowledgeResults((prev) => [
                ...prev,
                ...knowledgeResults.nodes,
              ]);
            } else {
              setRawKnowledgeResults(knowledgeResults.nodes);
            }
            setNextPageCursor(knowledgeResults.nextPageCursor);
            setHasMore(!!knowledgeResults.nextPageCursor);
          }

          if (chunk.toolResults) {
            // Tool results only come on first page
            const { toolResults } = chunk;
            setToolResults((prev) => [
              ...prev,
              ...(toolResults as ToolSearchResult[]),
            ]);
          }

          setIsSearchValidating(false);
        }

        setIsSearchLoading(false);
        setIsLoadingNextPage(false);
      } catch (error) {
        if (!abortController.signal.aborted) {
          setIsSearchError(
            error instanceof Error ? error : new Error("Search failed")
          );
        }
        setIsSearchLoading(false);
        setIsLoadingNextPage(false);
        setIsSearchValidating(false);
      }
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
      dustAPI,
    ]
  );

  useEffect(() => {
    setRawKnowledgeResults([]);
    setToolResults([]);
    setNextPageCursor(null);
    setHasMore(false);
    setIsSearchError(null);

    // Abort any existing request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Load first page
    void loadPage();

    // Cleanup function
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    };
  }, [loadPage]);

  const nextPage = useCallback(async () => {
    if (nextPageCursor && !isLoadingNextPage) {
      await loadPage(nextPageCursor, true);
    }
  }, [nextPageCursor, isLoadingNextPage, loadPage]);

  return {
    knowledgeResults: knowledgeResults.length > 0 ? knowledgeResults : [],
    toolResults: toolResults.length > 0 ? toolResults : [],
    isSearchLoading,
    isLoadingNextPage,
    isSearchValidating,
    isSearchError,
    hasMore,
    nextPage,
  };
}
