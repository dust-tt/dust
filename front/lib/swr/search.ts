import type { ToolSearchResult } from "@app/lib/search/tools/types";
import { usePodFiles } from "@app/lib/swr/pods";
import {
  emptyArray,
  useFetcher,
  useSWRInfiniteWithDefaults,
} from "@app/lib/swr/swr";
import type { ContentNodeWithParent } from "@app/types/connectors/connectors_api";
import type { ContentNodesViewType } from "@app/types/connectors/content_nodes";
import type { DataSourceType } from "@app/types/data_source";
import type { DataSourceViewType } from "@app/types/data_source_view";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { removeNulls } from "@app/types/shared/utils/general";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { useSWRConfig } from "swr";

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

type SearchPageKey = [url: string, generation: number, searchUrl: string];

interface SearchRequestScope {
  generation: number;
  consumers: number;
  controllers: Set<AbortController>;
}

const searchRequestScopes = new WeakMap<
  object,
  Map<string, SearchRequestScope>
>();

/**
 * @cc [owner:id13,label:react;concurrency] latest-search-request-wins
 * Late responses MUST NOT replace results for a newer query or a restarted request.
 */
/**
 * @cc [owner:id13,label:react;concurrency] search-request-cancellation
 * Query changes, disabling, and unmounting MUST abort pending requests when no consumer in the
 * same SWR cache still needs them. Removing one consumer MUST NOT abort another's shared request.
 */
/**
 * @cc [owner:id13,label:react;concurrency] search-pagination-serialization
 * Pagination MUST have at most one pending request per hook instance.
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
  const { fetcher } = useFetcher();
  const { cache } = useSWRConfig();
  const paginationRef = useRef<Promise<unknown> | null>(null);
  const params = new URLSearchParams({
    query,
    limit: pageSize.toString(),
    viewType,
    includeDataSources: includeDataSources.toString(),
    searchSourceUrls: searchSourceUrls.toString(),
    prioritizeSpaceAccess: prioritizeSpaceAccess.toString(),
    includeTools: includeTools.toString(),
  });
  if (spaceIds && spaceIds.length > 0) {
    params.set("spaceIds", spaceIds.join(","));
  }
  if (excludeNonRemoteDatabaseTables) {
    params.set("excludeNonRemoteDatabaseTables", "true");
  }
  const searchPath = `/api/w/${owner.sId}/search`;
  const searchParams = params.toString();
  const searchUrl = `${searchPath}?${searchParams}`;

  const requestScope = useMemo(() => {
    let scopes = searchRequestScopes.get(cache);
    if (!scopes) {
      scopes = new Map();
      searchRequestScopes.set(cache, scopes);
    }
    let scope = scopes.get(searchUrl);
    if (!scope) {
      scope = { generation: 0, consumers: 0, controllers: new Set() };
      scopes.set(searchUrl, scope);
    }
    return scope;
  }, [cache, searchUrl]);
  const generation = requestScope.generation;

  useLayoutEffect(() => {
    if (disabled) {
      return;
    }
    requestScope.consumers++;
    return () => {
      paginationRef.current = null;
      requestScope.consumers--;
      queueMicrotask(() => {
        if (requestScope.consumers > 0 || requestScope.controllers.size === 0) {
          return;
        }
        requestScope.generation++;
        for (const controller of requestScope.controllers) {
          controller.abort();
        }
        requestScope.controllers.clear();
      });
    };
  }, [disabled, requestScope]);

  const getKey = useCallback(
    (
      pageIndex: number,
      previousPage: UnifiedSearchResponse | null
    ): SearchPageKey | null => {
      if (disabled) {
        return null;
      }
      if (pageIndex === 0) {
        return [searchUrl, generation, searchUrl];
      }
      const cursor = previousPage?.knowledgeResults?.nextPageCursor;
      if (!cursor) {
        return null;
      }
      const pageParams = new URLSearchParams(searchParams);
      pageParams.set("cursor", cursor);
      pageParams.set("includeTools", "false");
      return [`${searchPath}?${pageParams.toString()}`, generation, searchUrl];
    },
    [disabled, generation, searchParams, searchPath, searchUrl]
  );

  const fetchPage = useCallback(
    async ([
      url,
      requestGeneration,
    ]: SearchPageKey): Promise<UnifiedSearchResponse> => {
      const controller = new AbortController();
      const isRequestCurrent =
        requestScope.consumers > 0 &&
        requestScope.generation === requestGeneration;
      if (isRequestCurrent) {
        requestScope.controllers.add(controller);
      } else {
        controller.abort();
      }
      try {
        const result: UnifiedSearchResponse = await fetcher(url, {
          headers: { Accept: "application/json" },
          signal: controller.signal,
        });
        controller.signal.throwIfAborted();
        return result;
      } finally {
        requestScope.controllers.delete(controller);
      }
    },
    [fetcher, requestScope]
  );

  const { data, error, isLoading, isValidating, size, setSize } =
    useSWRInfiniteWithDefaults(getKey, fetchPage, {
      disabled,
      revalidateFirstPage: false,
      revalidateOnFocus: false,
      revalidateOnReconnect: false,
      shouldRetryOnError: false,
    });

  const rawKnowledgeResults = useMemo(
    () =>
      disabled
        ? emptyArray<DataSourceViewContentNode>()
        : (data?.flatMap((page) => page.knowledgeResults?.nodes ?? []) ??
          emptyArray<DataSourceViewContentNode>()),
    [data, disabled]
  );
  const toolResults = disabled
    ? emptyArray<ToolSearchResult>()
    : (data?.[0]?.toolResults ?? emptyArray<ToolSearchResult>());
  const hasMore = !disabled && !!data?.at(-1)?.knowledgeResults?.nextPageCursor;
  const isSearchError = useMemo(
    () => (!disabled && error ? normalizeError(error) : null),
    [disabled, error]
  );

  const nextPage = useCallback(async () => {
    if (!hasMore || isValidating || paginationRef.current) {
      return;
    }
    const pending = setSize(size + 1);
    paginationRef.current = pending;
    try {
      await pending;
    } finally {
      if (paginationRef.current === pending) {
        paginationRef.current = null;
      }
    }
  }, [hasMore, isValidating, setSize, size]);

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
    isSearchLoading: !disabled && isLoading,
    isLoadingNextPage:
      !disabled && !error && size > 1 && size > (data?.length ?? 0),
    isSearchValidating: !disabled && isValidating,
    isSearchError,
    hasMore,
    nextPage,
  };
}
