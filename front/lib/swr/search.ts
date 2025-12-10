import { useEffect, useRef, useState } from "react";

import type { ToolSearchResult } from "@app/lib/search/tools/types";
import { emptyArray } from "@app/lib/swr/swr";
import type { LightWorkspaceType } from "@app/types";

interface ToolSearchStreamChunk {
  results: ToolSearchResult[];
  resultsCount: number;
  done?: boolean;
  totalCount?: number;
}

export function useSearchToolFiles({
  owner,
  query,
  pageSize = 25,
  disabled = false,
}: {
  owner: LightWorkspaceType;
  query: string;
  pageSize?: number;
  disabled?: boolean;
}) {
  const [searchResults, setSearchResults] = useState<ToolSearchResult[]>([]);
  const [resultsCount, setResultsCount] = useState(0);
  const [isSearchLoading, setIsSearchLoading] = useState(false);
  const [isSearchError, setIsSearchError] = useState<Error | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearchResults([]);
    setResultsCount(0);
    setIsSearchError(null);

    // Close any existing EventSource
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    // Don't start a new search if disabled or query too short
    if (disabled || !query || query.length < 3) {
      setIsSearchLoading(false);
      return;
    }

    setIsSearchLoading(true);

    const url = `/api/w/${owner.sId}/search/tools?query=${encodeURIComponent(query)}&pageSize=${pageSize}&stream=true`;
    const eventSource = new EventSource(url);
    eventSourceRef.current = eventSource;

    const accumulatedResults: ToolSearchResult[] = [];

    eventSource.onopen = () => {
      setIsSearchLoading(true);
    };

    eventSource.onmessage = (event) => {
      try {
        const chunk: ToolSearchStreamChunk = JSON.parse(event.data);

        if (chunk.done) {
          // Final message with totalCount
          setResultsCount(chunk.totalCount ?? 0);
          setIsSearchLoading(false);
          eventSource.close();
        } else {
          // Accumulate results as they come in
          accumulatedResults.push(...chunk.results);
          setSearchResults([...accumulatedResults]);
          setResultsCount(accumulatedResults.length);
        }
      } catch (error) {
        setIsSearchError(
          error instanceof Error ? error : new Error("Failed to parse stream")
        );
        setIsSearchLoading(false);
        eventSource.close();
      }
    };

    eventSource.onerror = () => {
      setIsSearchError(new Error("Failed to fetch search results"));
      setIsSearchLoading(false);
      eventSource.close();
    };

    // Cleanup function
    return () => {
      eventSource.close();
    };
  }, [owner.sId, query, pageSize, disabled]);

  return {
    searchResults:
      searchResults.length > 0 ? searchResults : emptyArray<ToolSearchResult>(),
    resultsCount,
    isSearchLoading,
    isSearchValidating: false, // No validation with streaming
    isSearchError,
  };
}
