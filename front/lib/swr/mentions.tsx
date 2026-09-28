import { useSendNotification } from "@app/hooks/useNotification";
import { useSearchAgents } from "@app/hooks/useSearchAgents";
import { clientFetch } from "@app/lib/egress/client";
import {
  interleaveMentionsPreservingAgentOrder,
  SUGGESTION_DISPLAY_LIMIT,
} from "@app/lib/mentions/editor/suggestion";
import {
  emptyArray,
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
import type {
  RichMention,
  RichUserMentionInConversation,
} from "@app/types/assistant/mentions";
import type { LightWorkspaceType } from "@app/types/user";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Fetcher } from "swr";

type UserMentionSuggestionsResponseBody = {
  suggestions: RichUserMentionInConversation[];
};

/**
 * @cc [owner:aubin-tchoi,label:react;product] mention-agent-search-order
 * Agent suggestions MUST use the agent search endpoint, including for an empty query,
 * and retain its order when interleaved with user mentions.
 */
/**
 * @cc [owner:aubin-tchoi,label:react;product] disabled-mention-types
 * Disabled mention types MUST NOT be fetched or included in the returned suggestions.
 */
export function useMentionSuggestions({
  owner,
  conversationId,
  spaceId,
  query = "",
  select,
  disabled = false,
  includeCurrentUser = false,
}: {
  owner: LightWorkspaceType;
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
  const suggestionsFetcher: Fetcher<UserMentionSuggestionsResponseBody> =
    fetcher;
  const {
    agents,
    isAgentsLoading,
    isAgentsError,
    mutate: mutateAgents,
  } = useSearchAgents({
    owner,
    searchTerm: query,
    limit: SUGGESTION_DISPLAY_LIMIT,
    permissionFiltering: "strict",
    disabled: disabled || !select.agents,
  });

  const debounceHandle = useRef<NodeJS.Timeout | undefined>(undefined);
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState(query);

  useEffect(() => {
    const debouncedSearch = () => {
      setDebouncedSearchQuery(query);
    };

    debounce(debounceHandle, debouncedSearch, 100);
  }, [query]);

  const searchParams = new URLSearchParams({
    query: debouncedSearchQuery,
    select: "users",
  });
  if (includeCurrentUser) {
    searchParams.append("current", "true");
  }

  if (!conversationId && spaceId) {
    searchParams.append("spaceId", spaceId);
  }

  const url =
    (conversationId
      ? `/api/w/${owner.sId}/assistant/conversations/${conversationId}/mentions/suggestions`
      : `/api/w/${owner.sId}/assistant/mentions/suggestions`) +
    `?${searchParams.toString()}`;

  const {
    data,
    error,
    mutate: mutateUsers,
  } = useSWRWithDefaults(url, suggestionsFetcher, {
    // Keep previous data while fetching new suggestions for better UX
    keepPreviousData: true,
    // We don't revalidate on focus to avoid unnecessary requests
    revalidateOnFocus: false,
    // Don't revalidate on reconnect for better performance
    revalidateOnReconnect: false,
    // Cache suggestions for 5 minutes
    dedupingInterval: 5 * 60 * 1000,
    disabled: disabled || !select.users,
  });

  // Keep the array stable so keyboard navigation does not reset on every render.
  const suggestions = useMemo(() => {
    if (disabled || (!select.agents && !select.users)) {
      return emptyArray<RichMention>();
    }
    const agentMentions = agents.map((agent) => ({
      id: agent.sId,
      type: "agent" as const,
      label: agent.name,
      pictureUrl: agent.pictureUrl,
      description: agent.description,
    }));
    const userMentions = select.users ? (data?.suggestions ?? []) : [];
    if (agentMentions.length === 0 && userMentions.length === 0) {
      return emptyArray<RichMention>();
    }

    return interleaveMentionsPreservingAgentOrder(
      agentMentions,
      userMentions,
      query.toLowerCase(),
      null,
      conversationId
    );
  }, [
    agents,
    conversationId,
    data,
    disabled,
    query,
    select.agents,
    select.users,
  ]);

  const mutate = useCallback(async () => {
    await Promise.all([
      !disabled && select.agents ? mutateAgents() : undefined,
      !disabled && select.users ? mutateUsers() : undefined,
    ]);
  }, [disabled, select.agents, select.users, mutateAgents, mutateUsers]);

  return {
    suggestions,
    isLoading:
      isAgentsLoading || (!disabled && select.users && !error && !data),
    isError:
      !disabled &&
      ((select.agents && isAgentsError) || (select.users && !!error)),
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
            description:
              mention.type === "agent"
                ? `${mention.label} will run in this conversation.`
                : isProjectConversation
                  ? `${mention.label} has been added to the Pod, and added to the conversation`
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
