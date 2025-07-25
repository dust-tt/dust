import { useCallback, useState } from "react";
import type { Fetcher } from "swr";

import type {
  AnalyticsMCPAction,
  GetMCPActionsResult,
} from "@app/lib/api/actions/agent_mcp_action_analytics";
import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import type { LightWorkspaceType } from "@app/types";

interface UseMCPActionsProps {
  owner: LightWorkspaceType;
  agentId: string;
  pageSize?: number;
}

interface UseMCPActionsReturn {
  actions: AnalyticsMCPAction[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
  isLoading: boolean;
  isError: boolean;
  setPage: (page: number) => void;
  nextPage: () => void;
  previousPage: () => void;
  canGoNext: boolean;
  canGoPrevious: boolean;
  mutate: () => void;
}

export function useMCPActions({
  owner,
  agentId,
  pageSize = 25,
}: UseMCPActionsProps): UseMCPActionsReturn {
  const [currentPage, setCurrentPage] = useState(0);
  const [cursors, setCursors] = useState<(string | null)[]>([null]);

  const mcpActionsFetcher: Fetcher<GetMCPActionsResult> = fetcher;

  // For the current page, we need the cursor from our cache
  const cursor = cursors[currentPage] || null;
  const url = cursor
    ? `/api/w/${owner.sId}/labs/mcp_actions/${agentId}?limit=${pageSize}&cursor=${cursor}`
    : `/api/w/${owner.sId}/labs/mcp_actions/${agentId}?limit=${pageSize}`;

  const { data, error, mutate } = useSWRWithDefaults(url, mcpActionsFetcher);

  // Update cursors when we get new data
  const handleSetPage = useCallback(
    (page: number) => {
      setCurrentPage(page);

      // If we're going to a page we haven't fetched yet, add the cursor
      if (data?.nextCursor && page === cursors.length) {
        setCursors((prev) => [...prev, data.nextCursor]);
      }
    },
    [data?.nextCursor, cursors.length]
  );

  const nextPage = useCallback(() => {
    if (data?.nextCursor) {
      handleSetPage(currentPage + 1);
    }
  }, [currentPage, data?.nextCursor, handleSetPage]);

  const previousPage = useCallback(() => {
    if (currentPage > 0) {
      setCurrentPage(currentPage - 1);
    }
  }, [currentPage]);

  const totalPages = data?.totalCount
    ? Math.ceil(data.totalCount / pageSize)
    : 0;
  const canGoNext = Boolean(data?.nextCursor);
  const canGoPrevious = currentPage > 0;

  return {
    actions: data?.actions || [],
    totalCount: data?.totalCount || 0,
    currentPage,
    totalPages,
    isLoading: !error && !data,
    isError: !!error,
    setPage: handleSetPage,
    nextPage,
    previousPage,
    canGoNext,
    canGoPrevious,
    mutate,
  };
}
