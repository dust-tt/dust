import { useEffect, useRef, useState } from "react";
import type { Fetcher } from "swr";

import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import { debounce } from "@app/lib/utils/debounce";
import type { PostMentionActionResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/messages/[mId]/mentions";
import type { RichMention, RichMentionWithStatus } from "@app/types";

type MentionSuggestionsResponseBody = {
  suggestions: RichMention[];
};

export function useMentionSuggestions({
  workspaceId,
  conversationId,
  query = "",
  select,
  disabled = false,
  includeCurrentUser = false,
}: {
  workspaceId: string;
  conversationId: string | null;
  query?: string;
  select: {
    agents: boolean;
    users: boolean;
  };
  disabled?: boolean;
  includeCurrentUser?: boolean;
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
  if (includeCurrentUser) {
    searchParams.append("current", "true");
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

export function useMentionValidation({
  workspaceId,
  conversationId,
  messageId,
}: {
  workspaceId: string;
  conversationId: string;
  messageId: string;
}) {
  const sendNotification = useSendNotification();

  const validateMention = async (
    mention: RichMentionWithStatus,
    action: "approved" | "rejected"
  ): Promise<boolean> => {
    try {
      const url = `/api/w/${workspaceId}/assistant/conversations/${conversationId}/messages/${messageId}/mentions`;

      const res = await clientFetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          type: mention.type,
          id: mention.id,
          action,
        }),
      });

      if (!res.ok) {
        const errorData = await getErrorFromResponse(res);
        sendNotification({
          type: "error",
          title: `Error ${action === "approved" ? "approving" : "rejecting"} mention`,
          description: errorData.message || "An error occurred",
        });
        return false;
      }

      const result: PostMentionActionResponseBody = await res.json();

      if (result.success && action === "approved") {
        sendNotification({
          type: "success",
          title: "Success",
          description: `${mention.label} has been invited to the conversation.`,
        });
        return true;
      }

      return false;
    } catch (error) {
      sendNotification({
        type: "error",
        title: `Error ${action === "approved" ? "approving" : "rejecting"} mention`,
        description:
          error instanceof Error ? error.message : "An error occurred",
      });
      return false;
    }
  };

  return { validateMention };
}
