import { useCallback, useEffect, useRef, useState } from "react";
import type { Fetcher } from "swr";

import { useSendNotification } from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import { getErrorFromResponse } from "@app/lib/swr/swr";
import { fetcher, useSWRWithDefaults } from "@app/lib/swr/swr";
import { debounce } from "@app/lib/utils/debounce";
import type {
  PostMentionActionRequestBody,
  PostMentionActionResponseBody,
} from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/messages/[mId]/mentions";
import type { RichMentionWithStatus } from "@app/types/assistant/conversation";
import type { RichMention } from "@app/types/assistant/mentions";

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
  const sendNotification = useSendNotification();
  const dismissMention = useCallback(
    async (mention: RichMentionWithStatus): Promise<boolean> => {
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
            action: "dismissed",
          } as PostMentionActionRequestBody),
        });

        if (!res.ok) {
          const errorData = await getErrorFromResponse(res);
          sendNotification({
            type: "error",
            title: `Error dismissing mention`,
            description: errorData.message ?? "An error occurred",
          });
          return false;
        }

        const result: PostMentionActionResponseBody = await res.json();

        return result.success;
      } catch (error) {
        console.error(error);
        return false;
      }
    },
    [workspaceId, conversationId, messageId, sendNotification]
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
  const sendNotification = useSendNotification();

  const validateMention = useCallback(
    async (
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
          } as PostMentionActionRequestBody),
        });

        if (!res.ok) {
          const errorData = await getErrorFromResponse(res);
          const actionLabel = action === "approved" ? "approving" : "rejecting";
          sendNotification({
            type: "error",
            title: `Error ${actionLabel} mention`,
            description: errorData.message ?? "An error occurred",
          });
          return false;
        }

        const result: PostMentionActionResponseBody = await res.json();

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
        sendNotification({
          type: "error",
          title: `Error ${actionLabel} mention`,
          description:
            error instanceof Error ? error.message : "An error occurred",
        });
        return false;
      }
    },
    [
      workspaceId,
      conversationId,
      messageId,
      isProjectConversation,
      sendNotification,
    ]
  );

  return { validateMention };
}
