import { useSendNotification } from "@app/hooks/useNotification";
import { useFetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import { debounce } from "@app/lib/utils/debounce";
import type {
  PostMentionActionRequestBody,
  PostMentionActionResponseBody,
} from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/messages/[mId]/mentions";
import type { RichMentionWithStatus } from "@app/types/assistant/conversation";
import type { RichMention } from "@app/types/assistant/mentions";
import { isAPIErrorResponse } from "@app/types/error";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Fetcher } from "swr";

type MentionSuggestionsResponseBody = {
  suggestions: RichMention[];
};

export function useMentionSuggestions({
  workspaceId,
  conversationId,
  spaceId,
  query = "",
  select,
  disabled = false,
  includeCurrentUser = false,
}: {
  workspaceId: string;
  conversationId: string | null;
  spaceId?: string;
  query?: string;
  select: {
    agents: boolean;
    users: boolean;
  };
  disabled?: boolean;
  includeCurrentUser?: boolean;
}) {
  const { fetcher } = useFetcher();
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

  if (!conversationId && spaceId) {
    searchParams.append("spaceId", spaceId);
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

export function useDismissMention({
  workspaceId,
  conversationId,
  messageId,
}: {
  workspaceId: string;
  conversationId: string;
  messageId: string;
}) {
  const { fetcherWithBody } = useFetcher();
  const sendNotification = useSendNotification();
  const dismissMention = useCallback(
    async (mention: RichMentionWithStatus): Promise<boolean> => {
      try {
        const result: PostMentionActionResponseBody = await fetcherWithBody([
          `/api/w/${workspaceId}/assistant/conversations/${conversationId}/messages/${messageId}/mentions`,
          {
            type: mention.type,
            id: mention.id,
            action: "dismissed",
          } as PostMentionActionRequestBody,
          "POST",
        ]);

        return result.success;
      } catch (e) {
        if (isAPIErrorResponse(e)) {
          sendNotification({
            type: "error",
            title: `Error dismissing mention`,
            description: e.error.message ?? "An error occurred",
          });
        }
        return false;
      }
    },
    [workspaceId, conversationId, messageId, sendNotification, fetcherWithBody]
  );

  return { dismissMention };
}

export function useMentionValidation({
  workspaceId,
  conversationId,
  messageId,
  isProjectConversation,
}: {
  workspaceId: string;
  conversationId: string;
  messageId: string;
  isProjectConversation: boolean;
}) {
  const { fetcherWithBody } = useFetcher();
  const sendNotification = useSendNotification();

  const validateMention = useCallback(
    async (
      mention: RichMentionWithStatus,
      action: "approved" | "rejected"
    ): Promise<boolean> => {
      try {
        const result: PostMentionActionResponseBody = await fetcherWithBody([
          `/api/w/${workspaceId}/assistant/conversations/${conversationId}/messages/${messageId}/mentions`,
          {
            type: mention.type,
            id: mention.id,
            action,
          } as PostMentionActionRequestBody,
          "POST",
        ]);

        if (result.success && action === "approved") {
          sendNotification({
            type: "success",
            title: "Success",
            description: isProjectConversation
              ? `${mention.label} has been added to the project, and added to the conversation`
              : `${mention.label} has been invited to the conversation.`,
          });
        }

        return result.success;
      } catch (error) {
        const actionLabel = action === "approved" ? "approving" : "rejecting";
        if (isAPIErrorResponse(error)) {
          sendNotification({
            type: "error",
            title: `Error ${actionLabel} mention`,
            description: error.error.message ?? "An error occurred",
          });
        } else {
          sendNotification({
            type: "error",
            title: `Error ${actionLabel} mention`,
            description:
              error instanceof Error ? error.message : "An error occurred",
          });
        }
        return false;
      }
    },
    [
      workspaceId,
      conversationId,
      messageId,
      isProjectConversation,
      sendNotification,
      fetcherWithBody,
    ]
  );

  return { validateMention };
}
