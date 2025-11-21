import { useEffect, useRef, useState } from "react";
import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import { debounce } from "@app/lib/utils/debounce";
import type { RichMention } from "@app/types";

type MentionSuggestionsResponseBody = {
  suggestions: RichMention[];
};

/**
 * Hook to fetch mention suggestions (agents and users) based on a query.
 * This hook makes a server-side request to filter and sort suggestions.
 *
 * @param workspaceId - The workspace ID
 * @param conversationId - The conversation ID
 * @param query - The search query string (can be empty for initial suggestions)
 * @param disabled - Whether to disable the request
 */
export function useMentionSuggestions({
  workspaceId,
  conversationId,
  query = "",
  disabled = false,
}: {
  workspaceId: string;
  conversationId: string | null;
  query?: string;
  disabled?: boolean;
}) {
  const suggestionsFetcher: Fetcher<MentionSuggestionsResponseBody> = fetcher;

  const debounceHandle = useRef<NodeJS.Timeout | undefined>(undefined);
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(query);

  useEffect(() => {
    const debouncedSearch = () => {
      setDebouncedSearchQuery(query);
    };

    debounce(debounceHandle, debouncedSearch, 100);
  }, [query]);

  const searchParams = new URLSearchParams({ query: debouncedSearchQuery });
  if (conversationId) {
    searchParams.append("conversationId", conversationId);
  }

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/assistant/mentions/suggestions?${searchParams.toString()}`,
    suggestionsFetcher,
    {
      // Keep previous data while fetching new suggestions for better UX
      keepPreviousData: true,
      // Revalidate on focus to keep suggestions fresh
      revalidateOnFocus: false,
      // Don't revalidate on reconnect for better performance
      revalidateOnReconnect: false,
      // Cache suggestions for 5 minutes
      dedupingInterval: 5 * 60 * 1000,
      disabled,
    }
  );

  return {
    suggestions: data?.suggestions ?? [],
    isLoading: !error && !data,
    isError: !!error,
    mutate,
  };
}
