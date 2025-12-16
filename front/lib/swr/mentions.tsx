import { useEffect, useRef, useState } from "react";
import type { Fetcher } from "swr";

import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import { debounce } from "@app/lib/utils/debounce";
import type { RichMention } from "@app/types";

type MentionSuggestionsResponseBody = {
  suggestions: RichMention[];
};

export function useMentionSuggestions({
  workspaceId,
  conversationId,
  query = "",
  select,
  disabled = false,
}: {
  workspaceId: string;
  conversationId: string | null;
  query?: string;
  select: {
    agents: boolean;
    users: boolean;
  };
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

  if (select.agents) {
    searchParams.append("select", "agents");
  }
  if (select.users) {
    searchParams.append("select", "users");
  }

  const url =
    (conversationId
      ? `/api/w/${workspaceId}/assistant/conversations/${conversationId}/mentions/suggestions`
      : `/api/w/${workspaceId}/assistant/mentions/suggestions`) +
    `?${searchParams.toString()}`;

  const { data, error, mutate } = useSWRWithDefaults(url, suggestionsFetcher, {
    // Keep previous data while fetching new suggestions for better UX
    keepPreviousData: true,
    // We don't revalidate on focus to avoid unnecessary requests
    revalidateOnFocus: false,
    // Don't revalidate on reconnect for better performance
    revalidateOnReconnect: false,
    // Cache suggestions for 5 minutes
    dedupingInterval: 5 * 60 * 1000,
    disabled,
  });

  return {
    suggestions: data?.suggestions ?? [],
    isLoading: !error && !data,
    isError: !!error,
    mutate,
  };
}
