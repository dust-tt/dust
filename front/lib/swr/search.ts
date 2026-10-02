import { clientFetch } from "@app/lib/egress/client";
import type { ToolSearchResult } from "@app/lib/search/tools/types";
import { usePodFiles } from "@app/lib/swr/pods";
import { emptyArray } from "@app/lib/swr/swr";
import type { ContentNodeWithParent } from "@app/types/connectors/connectors_api";
import type { ContentNodesViewType } from "@app/types/connectors/content_nodes";
import type { DataSourceType } from "@app/types/data_source";
import type { DataSourceViewType } from "@app/types/data_source_view";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { removeNulls } from "@app/types/shared/utils/general";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

export type DataSourceViewContentNode = ContentNodeWithParent & {
  dataSource: DataSourceType;
  dataSourceViews: DataSourceViewType[];
};

export type ProjectFileSearchResult = {
  fileId: string;
  title: string;
  contentType: string;
};

interface UnifiedSearchResponse {
  knowledgeResults?: {
    nodes: DataSourceViewContentNode[];
    warningCode: string | null;
    nextPageCursor: string | null;
    resultsCount: number | null;
  };
  toolResults?: ToolSearchResult[];
}

/**
 * @cc [owner:id13,label:react;concurrency] latest-search-request-wins
 * Query changes, disabling, and unmounting MUST cancel pending requests. Late responses MUST NOT
 * replace newer results. Pagination MUST have at most one pending request per hook instance.
 */
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
  const requestRef = useRef<AbortController | null>(null);

  const { files: projectFiles, isPodFilesLoading: isProjectFilesLoading } =
    usePodFiles({
      owner,
      podId: projectId ?? "",
      disabled: disabled || !projectId,
    });

  const projectContextFiles = useMemo<ProjectFileSearchResult[]>(() => {
    return removeNulls(
      projectFiles.map((f) => {
        if (f.isDirectory || f.fileId == null) {
          return null;
        }
        return {
          fileId: f.fileId,
          title: f.fileName,
          contentType: f.contentType,
        };
      })
    );
  }, [projectFiles]);

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
        setIsSearchValidating(false);
        return;
      }

      if (appendResults && requestRef.current) {
        return;
      }
      setIsSearchError(null);
      setIsSearchValidating(true);
      if (appendResults) {
        setIsLoadingNextPage(true);
      } else {
        setIsSearchLoading(true);
      }

      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;

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
      try {
        const response = await clientFetch(url, {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        if (!response.ok) {
          throw new Error("Failed to fetch search results");
        }
        const chunk: UnifiedSearchResponse = await response.json();
        if (requestRef.current !== controller || controller.signal.aborted) {
          return;
        }
        if (chunk.knowledgeResults) {
          const { knowledgeResults } = chunk;
          setRawKnowledgeResults((previous) =>
            appendResults
              ? [...previous, ...knowledgeResults.nodes]
              : knowledgeResults.nodes
          );
          setNextPageCursor(knowledgeResults.nextPageCursor);
          setHasMore(!!knowledgeResults.nextPageCursor);
        }
        const results = chunk.toolResults;
        if (results) {
          setToolResults((previous) =>
            appendResults ? [...previous, ...results] : results
          );
        }
      } catch (error) {
        if (requestRef.current === controller && !controller.signal.aborted) {
          setIsSearchError(normalizeError(error));
        }
      } finally {
        if (requestRef.current === controller) {
          requestRef.current = null;
          setIsSearchLoading(false);
          setIsLoadingNextPage(false);
          setIsSearchValidating(false);
        }
      }
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

    requestRef.current?.abort();
    requestRef.current = null;
    void loadPage();

    return () => {
      requestRef.current?.abort();
      requestRef.current = null;
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
      await loadPage(nextPageCursor, true);
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
        : emptyArray<ProjectFileSearchResult>(),
    isProjectContextFilesLoading: !!projectId && isProjectFilesLoading,
    isSearchLoading,
    isLoadingNextPage,
    isSearchValidating,
    isSearchError,
    hasMore,
    nextPage,
  };
}
