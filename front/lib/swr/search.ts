import type { FileAttachmentType } from "@app/lib/api/assistant/conversation/attachments";
import { clientEventSource } from "@app/lib/egress/client";
import type { ToolSearchResult } from "@app/lib/search/tools/types";
import { useProjectContextAttachments } from "@app/lib/swr/projects";
import { emptyArray } from "@app/lib/swr/swr";
import type { ContentNodeWithParent } from "@app/types/connectors/connectors_api";
import type { ContentNodesViewType } from "@app/types/connectors/content_nodes";
import type { DataSourceType } from "@app/types/data_source";
import type { DataSourceViewType } from "@app/types/data_source_view";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import type { EventSourcePolyfill } from "event-source-polyfill";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

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
  projectId,
  viewType = "all",
  excludeNonRemoteDatabaseTables = false,
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
  projectId?: string;
  viewType?: Exclude<ContentNodesViewType, "data_warehouse">;
  excludeNonRemoteDatabaseTables?: boolean;
  includeDataSources?: boolean;
  searchSourceUrls?: boolean;
  includeTools?: boolean;
  prioritizeSpaceAccess?: boolean;
}) {
  const [rawKnowledgeResults, setRawKnowledgeResults] = useState<
    DataSourceViewContentNode[]
  >([]);
  const [toolResults, setToolResults] = useState<ToolSearchResult[]>([]);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [isLoadingNextPage, setIsLoadingNextPage] = useState(false);
  const [isSearchValidating, setIsSearchValidating] = useState(false);
  const [isSearchError, setIsSearchError] = useState<Error | null>(null);
  const [nextPageCursor, setNextPageCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const eventSourceRef = useRef<EventSourcePolyfill | null>(null);

  const {
    attachments: projectContextAttachments,
    isProjectContextAttachmentsLoading,
  } = useProjectContextAttachments({
    owner,
    spaceId: projectId ?? "",
    query,
    type: "file",
    disabled: disabled || !projectId,
  });

  const projectContextFiles = useMemo((): FileAttachmentType[] => {
    // Server-side filtering (`type=file`) ensures the endpoint returns only file attachments.
    return projectContextAttachments as FileAttachmentType[];
  }, [projectContextAttachments]);

  const projectContextFileIds = useMemo(() => {
    return new Set(projectContextFiles.map((f) => f.fileId));
  }, [projectContextFiles]);

  const knowledgeResults = useMemo(() => {
    if (!projectId || projectContextFileIds.size === 0) {
      return rawKnowledgeResults;
    }

    // If a project file also exists as a `dust_project` knowledge node (Core),
    // we only keep the file representation.
    return rawKnowledgeResults.filter((n) => {
      if (n.dataSource.connectorProvider !== "dust_project") {
        return true;
      }
      return !projectContextFileIds.has(n.internalId);
    });
  }, [projectId, projectContextFileIds, rawKnowledgeResults]);

  const loadPage = useCallback(
    async (cursor?: string | null, appendResults = false) => {
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

      if (excludeNonRemoteDatabaseTables) {
        params.append("excludeNonRemoteDatabaseTables", "true");
      }

      if (cursor) {
        params.append("cursor", cursor);
      }

      const url = `/api/w/${owner.sId}/search?${params.toString()}`;
      const eventSource = await clientEventSource(url);
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
      excludeNonRemoteDatabaseTables,
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

  // biome-ignore lint/correctness/useExhaustiveDependencies: ignored using `--suppress`
  useLayoutEffect(() => {
    setRawKnowledgeResults([]);
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
    excludeNonRemoteDatabaseTables,
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
    projectContextFiles:
      projectContextFiles.length > 0
        ? projectContextFiles
        : emptyArray<FileAttachmentType>(),
    isProjectContextFilesLoading:
      !!projectId && isProjectContextAttachmentsLoading,
    isSearchLoading,
    isLoadingNextPage,
    isSearchValidating,
    isSearchError,
    hasMore,
    nextPage,
  };
}
