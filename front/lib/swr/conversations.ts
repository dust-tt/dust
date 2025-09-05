import { useCallback, useEffect, useMemo } from "react";
import type { Fetcher } from "swr";

import { deleteConversation } from "@app/components/assistant/conversation/lib";
import { useSendNotification } from "@app/hooks/useNotification";
import type { AgentMessageFeedbackType } from "@app/lib/api/assistant/feedback";
import { getVisualizationRetryMessage } from "@app/lib/client/visualization";
import {
  emptyArray,
  fetcher,
  useSWRInfiniteWithDefaults,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import type { GetConversationsResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations";
import type { PatchConversationsRequestBody } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]";
import type { GetConversationFilesResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/files";
import type { FetchConversationMessageResponse } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/messages/[mId]";
import type { FetchConversationParticipantsResponse } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/participants";
import type {
  ConversationToolActionRequest,
  FetchConversationToolsResponse,
} from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/tools";
import type {
  AgentParticipantType,
  ConversationError,
  ConversationWithoutContentType,
  FetchConversationMessagesResponse,
  LightWorkspaceType,
  UserParticipantType,
} from "@app/types";

const DELAY_BEFORE_MARKING_AS_READ = 2000;

export function useConversation({
  conversationId,
  workspaceId,
  options,
}: {
  conversationId: string | null;
  workspaceId: string;
  options?: { disabled: boolean };
}): {
  conversation: ConversationWithoutContentType | null;
  isConversationLoading: boolean;
  conversationError: ConversationError;
  mutateConversation: () => void;
} {
  const conversationFetcher: Fetcher<{
    conversation: ConversationWithoutContentType;
  }> = fetcher;

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

export function useConversationTools({
  conversationId,
  workspaceId,
  options,
}: {
  conversationId: string | null;
  workspaceId: string;
  options?: { disabled: boolean };
}) {
  const conversationToolsFetcher: Fetcher<FetchConversationToolsResponse> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    conversationId
      ? `/api/w/${workspaceId}/assistant/conversations/${conversationId}/tools`
      : null,
    conversationToolsFetcher,
    options
  );

  return {
    conversationTools: useMemo(
      () =>
        data
          ? data.tools
          : emptyArray<FetchConversationToolsResponse["tools"][number]>(),
      [data]
    ),
    isConversationToolsLoading: !error && !data,
    isConversationToolsError: error,
    mutateConversationTools: mutate,
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

export function useAddDeleteConversationTool({
  conversationId,
  workspaceId,
}: {
  conversationId: string | null;
  workspaceId: string;
}) {
  const { mutateConversationTools } = useConversationTools({
    conversationId,
    workspaceId,
    options: {
      disabled: true,
    },
  });

  const addTool = useCallback(
    async (mcpServerViewId: string): Promise<boolean> => {
      if (!conversationId) {
        return false;
      }

      try {
        const response = await fetch(
          `/api/w/${workspaceId}/assistant/conversations/${conversationId}/tools`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              action: "add",
              mcp_server_view_id: mcpServerViewId,
            } as ConversationToolActionRequest),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to add tool to conversation");
        }

        const result = await response.json();
        if (result.success) {
          // Refetch the tools list to get the updated state
          void mutateConversationTools();
          return true;
        }

        return false;
      } catch (error) {
        console.error("Error adding tool to conversation:", error);
        return false;
      }
    },
    [conversationId, workspaceId, mutateConversationTools]
  );

  const deleteTool = useCallback(
    async (mcpServerViewId: string): Promise<boolean> => {
      if (!conversationId) {
        return false;
      }

      try {
        const response = await fetch(
          `/api/w/${workspaceId}/assistant/conversations/${conversationId}/tools`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              action: "delete",
              mcp_server_view_id: mcpServerViewId,
            } as ConversationToolActionRequest),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to remove tool from conversation");
        }

        const result = await response.json();
        if (result.success) {
          // Refetch the tools list to get the updated state
          void mutateConversationTools();
          return true;
        }

        return false;
      } catch (error) {
        console.error("Error removing tool from conversation:", error);
        return false;
      }
    },
    [conversationId, workspaceId, mutateConversationTools]
  );

  return { addTool, deleteTool };
}

export function useVisualizationRetry({
  workspaceId,
  conversationId,
  agentConfigurationId,
  isPublic,
}: {
  workspaceId: string | null;
  conversationId: string | null;
  agentConfigurationId: string | null;
  isPublic: boolean;
}) {
  const canRetry = !isPublic && agentConfigurationId && conversationId;

  const handleVisualizationRetry = useCallback(
    async (errorMessage: string): Promise<boolean> => {
      if (!canRetry) {
        return false;
      }

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
    [workspaceId, conversationId, agentConfigurationId, canRetry]
  );

  return {
    handleVisualizationRetry,
    canRetry,
  };
}

export function useConversationMessage({
  conversationId,
  workspaceId,
  messageId,
  options,
}: {
  conversationId: string | null;
  workspaceId: string;
  messageId: string | null;
  options?: {
    disabled: boolean;
  };
}) {
  const messageFetcher: Fetcher<FetchConversationMessageResponse> = fetcher;

  const { data, error, mutate, isLoading, isValidating } = useSWRWithDefaults(
    messageId
      ? `/api/w/${workspaceId}/assistant/conversations/${conversationId}/messages/${messageId}`
      : null,
    messageFetcher,
    options
  );

  return {
    message: data?.message,
    isMessageError: error,
    isMessageLoading: isLoading,
    isValidating,
    mutateMessage: mutate,
  };
}

export function useConversationFiles({
  conversationId,
  options,
  owner,
}: {
  conversationId: string | null;
  options?: { disabled?: boolean };
  owner: LightWorkspaceType;
}) {
  const conversationFilesFetcher: Fetcher<GetConversationFilesResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    conversationId
      ? `/api/w/${owner.sId}/assistant/conversations/${conversationId}/files`
      : null,
    conversationFilesFetcher,
    options
  );

  return {
    conversationFiles: useMemo(() => data?.files ?? [], [data]),
    isConversationFilesLoading: !error && !data,
    isConversationFilesError: error,
    mutateConversationFiles: mutate,
  };
}

/**
 * This hook can be used to automatically mark a conversation as read after a delay.
 * It can also be used to manually mark a conversation as read.
 */
export function useConversationMarkAsRead({
  conversation,
  workspaceId,
}: {
  conversation: ConversationWithoutContentType | null;
  workspaceId: string;
}) {
  const { mutateConversations } = useConversations({
    workspaceId,
    options: {
      disabled: true,
    },
  });

  const markAsRead = useCallback(
    /**
     * @param conversationId - The ID of the conversation to mark as read.
     * @param mutateList - Whether to mutate the list of conversations in the sidebar.
     *
     * If mutateList is true, the list of conversations in the sidebar will be mutated to update the unread status of the conversation.
     * If mutateList is false, the list of conversations in the sidebar will not be mutated to update the unread status of the conversation.
     *
     * This is useful to avoid any network request when marking a conversation as read.
     * @param conversationId
     * @param mutateList
     */
    async (conversationId: string, mutateList: boolean): Promise<void> => {
      try {
        const response = await fetch(
          `/api/w/${workspaceId}/assistant/conversations/${conversationId}`,
          {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              read: true,
            } as PatchConversationsRequestBody),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to mark conversation as read");
        }
        if (mutateList) {
          void mutateConversations((prevState) => ({
            ...prevState,
            conversations:
              prevState?.conversations.map((c) =>
                c.sId === conversationId ? { ...c, unread: false } : c
              ) ?? [],
          }));
        }
      } catch (error) {
        console.error("Error marking conversation as read:", error);
      }
    },
    [workspaceId, mutateConversations]
  );

  useEffect(() => {
    let timeout: NodeJS.Timeout | null = null;
    if (conversation?.sId && conversation.unread) {
      timeout = setTimeout(
        () => markAsRead(conversation.sId, true),
        DELAY_BEFORE_MARKING_AS_READ
      );
    }

    return () => {
      if (timeout) {
        clearTimeout(timeout);
      }
    };
  }, [conversation?.sId, conversation?.unread, markAsRead]);

  return {
    markAsRead,
  };
}

type ConversationAction = "join" | "leave" | "delete";

export const useConversationMenu = ({
  ownerId,
  conversationId,
  userId,
}: {
  ownerId: string;
  conversationId: string | null;
  userId: string | null;
}): {
  joinConversation: () => Promise<boolean>;
  action: ConversationAction;
  users: UserParticipantType[];
  agents: AgentParticipantType[];
} => {
  const sendNotification = useSendNotification();

  const { mutateConversations } = useConversations({
    workspaceId: ownerId,
  });
  const { mutateConversationParticipants, conversationParticipants } =
    useConversationParticipants({
      conversationId,
      workspaceId: ownerId,
      options: { disabled: conversationId === null },
    });

  const isUserParticipating =
    userId !== null &&
    conversationParticipants?.users.find(
      (participant) => participant.sId === userId
    );

  const isLastParticipant =
    isUserParticipating && conversationParticipants?.users.length === 1;

  const joinConversation = useCallback(async (): Promise<boolean> => {
    if (!conversationId) {
      return false;
    }
    try {
      const response = await fetch(
        `/api/w/${ownerId}/assistant/conversations/${conversationId}/participants`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      if (!response.ok) {
        if (response.status === 400) {
          const error = await response.json();
          if (error.error?.message?.includes("already a participant")) {
            sendNotification({
              type: "error",
              title: "Already subscribed",
              description:
                "You are already a participant in this conversation.",
            });
            return false;
          }
        }
        throw new Error("Failed to subscribe to conversation");
      }

      sendNotification({
        type: "success",
        title: "Subscribed!",
        description: "You have been added to this conversation.",
      });

      void mutateConversations();
      void mutateConversationParticipants();

      return true;
    } catch (error) {
      console.error("Error subscribing to conversation:", error);
      sendNotification({
        type: "error",
        title: "Error",
        description: "Failed to subscribe to the conversation.",
      });
      return false;
    }
  }, [
    ownerId,
    sendNotification,
    mutateConversations,
    mutateConversationParticipants,
    conversationId,
  ]);

  return {
    joinConversation,
    action: isLastParticipant
      ? "delete"
      : isUserParticipating
        ? "leave"
        : "join",
    users: conversationParticipants?.users ?? [],
    agents: conversationParticipants?.agents ?? [],
  };
};
