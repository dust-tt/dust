import {
  useSendApiErrorNotification,
  useSendNotification,
} from "@app/hooks/useNotification";
import { clientFetch } from "@app/lib/egress/client";
import {
  getErrorFromResponse,
  useFetcher,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import { debounce } from "@app/lib/utils/debounce";
import type {
  PostMentionActionRequestBody,
  PostMentionActionResponseBody,
} from "@app/types/api/assistant/conversation/mentions";
import type { RichMentionWithStatus } from "@app/types/assistant/conversation";
import type { RichMention } from "@app/types/assistant/mentions";
import { useLingui } from "@lingui/react/macro";
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

  // Without any select param the endpoint returns both agents and users, so
  // skip the fetch entirely when nothing is selectable.
  const nothingSelectable = !select.agents && !select.users;

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
    // Avoid adding search load when suggestions fail.
    shouldRetryOnError: false,
    // Cache suggestions for 5 minutes
    dedupingInterval: 5 * 60 * 1000,
    disabled: disabled || nothingSelectable,
  });

  return {
    suggestions: data?.suggestions ?? [],
    isLoading: !error && !data && !(disabled || nothingSelectable),
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
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
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
          sendApiErrorNotification({
            title: t`Error dismissing mention`,
            error: errorData,
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
    [workspaceId, conversationId, messageId, sendApiErrorNotification, t]
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
  const { t } = useLingui();
  const sendApiErrorNotification = useSendApiErrorNotification();
  const sendNotification = useSendNotification();

  const validateMention = useCallback(
    async (
      mention: RichMentionWithStatus,
      action: "approved" | "rejected"
    ): Promise<boolean> => {
      const errorTitle =
        action === "approved"
          ? t`Error approving mention`
          : t`Error rejecting mention`;
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
          sendApiErrorNotification({
            title: errorTitle,
            error: errorData,
          });
          return false;
        }

        const result: PostMentionActionResponseBody = await res.json();

        if (result.success && action === "approved") {
          const mentionLabel = mention.label;
          sendNotification({
            type: "success",
            title: t`Success`,
            description:
              mention.type === "agent"
                ? t`${mentionLabel} will run in this conversation.`
                : isProjectConversation
                  ? t`${mentionLabel} has been added to the Pod and to the conversation.`
                  : t`${mentionLabel} has been invited to the conversation.`,
          });
        }

        return result.success;
      } catch (error) {
        sendApiErrorNotification({
          title: errorTitle,
          error,
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
      sendApiErrorNotification,
      t,
    ]
  );

  return { validateMention };
}
