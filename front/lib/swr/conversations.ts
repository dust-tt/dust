import { useSendNotification } from "@dust-tt/sparkle";
import { useCallback, useMemo } from "react";
import type { Fetcher } from "swr";

import { deleteConversation } from "@app/components/assistant/conversation/lib";
import type { AgentMessageFeedbackType } from "@app/lib/api/assistant/feedback";
import type { FetchConversationMessagesResponse } from "@app/lib/api/assistant/messages";
import { getVisualizationRetryMessage } from "@app/lib/client/visualization";
import {
  emptyArray,
  fetcher,
  useSWRInfiniteWithDefaults,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { GetConversationsResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations";
import type { FetchConversationParticipantsResponse } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/participants";
import type {
  ConversationError,
  ConversationType,
  ConversationWithoutContentType,
  LightWorkspaceType,
} from "@app/types";

export function useConversation({
  conversationId,
  workspaceId,
  options,
}: {
  conversationId: string | null;
  workspaceId: string;
  options?: { disabled: boolean };
}): {
  conversation: ConversationType | null;
  isConversationLoading: boolean;
  conversationError: ConversationError;
  mutateConversation: () => void;
} {
  const conversationFetcher: Fetcher<{ conversation: ConversationType }> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    conversationId
      ? `/api/w/${workspaceId}/assistant/conversations/${conversationId}`
      : null,
    conversationFetcher,
    options
  );

  return {
    conversation: data ? data.conversation : null,
    isConversationLoading: !error && !data,
    conversationError: error,
    mutateConversation: mutate,
  };
}

export function useConversations({
  workspaceId,
  options,
}: {
  workspaceId: string;
  options?: { disabled: boolean };
}) {
  const conversationFetcher: Fetcher<GetConversationsResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/assistant/conversations`,
    conversationFetcher,
    options
  );

  return {
    conversations: data?.conversations ?? emptyArray(),
    isConversationsLoading: !error && !data,
    isConversationsError: error,
    mutateConversations: mutate,
  };
}

export function useConversationFeedbacks({
  conversationId,
  workspaceId,
}: {
  conversationId: string;
  workspaceId: string;
}) {
  const conversationFeedbacksFetcher: Fetcher<{
    feedbacks: AgentMessageFeedbackType[];
  }> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/assistant/conversations/${conversationId}/feedbacks`,
    conversationFeedbacksFetcher
  );

  return {
    feedbacks: data?.feedbacks ?? emptyArray(),
    isFeedbacksLoading: !error && !data,
    isFeedbacksError: error,
    mutateReactions: mutate,
  };
}

export function useConversationMessages({
  conversationId,
  workspaceId,
  limit,
}: {
  conversationId: string | null;
  workspaceId: string;
  limit: number;
  startAtRank?: number;
}) {
  const messagesFetcher: Fetcher<FetchConversationMessagesResponse> = fetcher;

  const { data, error, mutate, size, setSize, isLoading, isValidating } =
    useSWRInfiniteWithDefaults(
      (pageIndex: number, previousPageData) => {
        if (!conversationId) {
          return null;
        }

        // If we have reached the last page and there are no more
        // messages or the previous page has no messages, return null.
        if (
          previousPageData &&
          (previousPageData.messages.length === 0 || !previousPageData.hasMore)
        ) {
          return null;
        }

        if (previousPageData === null) {
          return `/api/w/${workspaceId}/assistant/conversations/${conversationId}/messages?orderDirection=desc&orderColumn=rank&limit=${limit}`;
        }

        return `/api/w/${workspaceId}/assistant/conversations/${conversationId}/messages?lastValue=${previousPageData.lastValue}&orderDirection=desc&orderColumn=rank&limit=${limit}`;
      },
      messagesFetcher,
      {
        revalidateAll: false,
        revalidateOnFocus: false,
      }
    );

  return {
    isLoadingInitialData: !error && !data,
    isMessagesError: error,
    isMessagesLoading: isLoading,
    isValidating,
    messages: useMemo(() => (data ? [...data].reverse() : []), [data]),
    mutateMessages: mutate,
    setSize,
    size,
  };
}

export function useConversationParticipants({
  conversationId,
  workspaceId,
  options,
}: {
  conversationId: string | null;
  workspaceId: string;
  options?: { disabled: boolean };
}) {
  const conversationParticipantsFetcher: Fetcher<FetchConversationParticipantsResponse> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    conversationId
      ? `/api/w/${workspaceId}/assistant/conversations/${conversationId}/participants`
      : null,
    conversationParticipantsFetcher,
    options
  );

  return {
    conversationParticipants: useMemo(
      () => (data ? data.participants : undefined),
      [data]
    ),
    isConversationParticipantsLoading: !error && !data,
    isConversationParticipantsError: error,
    mutateConversationParticipants: mutate,
  };
}

export const useDeleteConversation = (owner: LightWorkspaceType) => {
  const sendNotification = useSendNotification();
  const { mutateConversations } = useConversations({
    workspaceId: owner.sId,
  });

  const doDelete = async (
    conversation: ConversationWithoutContentType | null
  ) => {
    if (!conversation) {
      return false;
    }
    const res = await deleteConversation({
      workspaceId: owner.sId,
      conversationId: conversation.sId,
      sendNotification,
    });
    if (res) {
      void mutateConversations((prevState) => {
        return {
          ...prevState,
          conversations:
            prevState?.conversations.filter(
              (c) => c.sId !== conversation.sId
            ) ?? [],
        };
      });
    }
    return res;
  };

  return doDelete;
};

export function useVisualizationRetry({
  workspaceId,
  conversationId,
  agentConfigurationId,
}: {
  workspaceId: string;
  conversationId: string;
  agentConfigurationId: string;
}) {
  const handleVisualizationRetry = useCallback(
    async (errorMessage: string) => {
      try {
        const response = await fetch(
          `/api/w/${workspaceId}/assistant/conversations/${conversationId}/messages`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              content: getVisualizationRetryMessage(errorMessage),
              mentions: [
                {
                  configurationId: agentConfigurationId,
                },
              ],
              context: {
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                profilePictureUrl: null,
              },
            }),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to send retry message");
        }

        return true;
      } catch (error) {
        console.error("Error sending retry message:", error);
        return false;
      }
    },
    [workspaceId, conversationId, agentConfigurationId]
  );

  return handleVisualizationRetry;
}
