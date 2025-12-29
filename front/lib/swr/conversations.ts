import { useCallback, useEffect, useMemo, useState } from "react";
import type { Fetcher } from "swr";

import { useSendNotification } from "@app/hooks/useNotification";
import type { AgentMessageFeedbackType } from "@app/lib/api/assistant/feedback";
import { getVisualizationRetryMessage } from "@app/lib/client/visualization";
import { clientFetch } from "@app/lib/egress/client";
import {
  emptyArray,
  fetcher,
  useSWRInfiniteWithDefaults,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import datadogLogger from "@app/logger/datadogLogger";
import type { GetConversationsResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations";
import type {
  GetConversationResponseBody,
  PatchConversationsRequestBody,
} from "@app/pages/api/w/[wId]/assistant/conversations/[cId]";
import type { GetConversationFilesResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/files";
import type { FetchConversationMessagesResponse } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/messages";
import type { FetchConversationMessageResponse } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/messages/[mId]";
import type { GetAgentMessageSkillsResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/messages/[mId]/skills";
import type { FetchConversationParticipantsResponse } from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/participants";
import type {
  ConversationSkillActionRequest,
  FetchConversationSkillsResponse,
} from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/skills";
import type {
  ConversationToolActionRequest,
  FetchConversationToolsResponse,
} from "@app/pages/api/w/[wId]/assistant/conversations/[cId]/tools";
import type { GetBySpacesSummaryResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/spaces";
import type { GetSpaceConversationsResponseBody } from "@app/pages/api/w/[wId]/assistant/conversations/spaces/[spaceId]";
import type {
  ConversationError,
  ConversationWithoutContentType,
  LightWorkspaceType,
} from "@app/types";
import { normalizeError } from "@app/types";

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
  mutateConversation: ReturnType<
    typeof useSWRWithDefaults<string, GetConversationResponseBody>
  >["mutate"];
} {
  const conversationFetcher: Fetcher<GetConversationResponseBody> = fetcher;

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

export function useSpaceConversationsSummary({
  workspaceId,
  options,
}: {
  workspaceId: string;
  options?: { disabled: boolean };
}) {
  const summaryFetcher: Fetcher<GetBySpacesSummaryResponseBody> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/assistant/conversations/spaces`,
    summaryFetcher,
    options
  );

  return {
    summary: data?.summary ?? emptyArray(),
    isLoading: !error && !data && !options?.disabled,
    isError: !!error,
    mutate,
  };
}

export function useSpaceConversations({
  workspaceId,
  spaceId,
  options,
}: {
  workspaceId: string;
  spaceId: string | null;
  options?: { disabled: boolean };
}) {
  const spaceConversationsFetcher: Fetcher<GetSpaceConversationsResponseBody> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    spaceId
      ? `/api/w/${workspaceId}/assistant/conversations/spaces/${spaceId}`
      : null,
    spaceConversationsFetcher,
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
  options,
}: {
  conversationId: string;
  workspaceId: string;
  options?: { disabled: boolean };
}) {
  const conversationFeedbacksFetcher: Fetcher<{
    feedbacks: AgentMessageFeedbackType[];
  }> = fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    `/api/w/${workspaceId}/assistant/conversations/${conversationId}/feedbacks`,
    conversationFeedbacksFetcher,
    {
      focusThrottleInterval: 30 * 60 * 1000, // 30 minutes
      ...options,
    }
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
          return `/api/w/${workspaceId}/assistant/conversations/${conversationId}/messages?newResponseFormat=1&orderDirection=desc&orderColumn=rank&limit=${limit}`;
        }

        return `/api/w/${workspaceId}/assistant/conversations/${conversationId}/messages?newResponseFormat=1&lastValue=${previousPageData.lastValue}&orderDirection=desc&orderColumn=rank&limit=${limit}`;
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
    { ...options, focusThrottleInterval: 30 * 60 * 1000 } // 30 minutes
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

export function useConversationSkills({
  conversationId,
  workspaceId,
  options,
}: {
  conversationId: string | null;
  workspaceId: string;
  options?: { disabled: boolean };
}) {
  const conversationSkillsFetcher: Fetcher<FetchConversationSkillsResponse> =
    fetcher;

  const { data, error, mutate } = useSWRWithDefaults(
    conversationId
      ? `/api/w/${workspaceId}/assistant/conversations/${conversationId}/skills`
      : null,
    conversationSkillsFetcher,
    { ...options, focusThrottleInterval: 30 * 60 * 1000 } // 30 minutes
  );

  return {
    conversationSkills: data
      ? data.skills
      : emptyArray<FetchConversationSkillsResponse["skills"][number]>(),
    isConversationSkillsLoading: !error && !data,
    isConversationSkillsError: error,
    mutateConversationSkills: mutate,
  };
}

// Cancel message generation for one or multiple messages within a conversation.
// Returns an async function that accepts a list of message IDs to cancel.
export function useCancelMessage({
  owner,
  conversationId,
}: {
  owner: LightWorkspaceType;
  conversationId: string | null;
}) {
  const sendNotification = useSendNotification();

  return useCallback(
    async (messageIds: string[]) => {
      if (!conversationId || messageIds.length === 0) {
        return;
      }
      try {
        await clientFetch(
          `/api/w/${owner.sId}/assistant/conversations/${conversationId}/cancel`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "cancel", messageIds }),
          }
        );
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
      } catch (error) {
        sendNotification({ type: "error", title: "Failed to cancel message" });
      }
    },
    [owner.sId, conversationId, sendNotification]
  );
}

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
        const response = await clientFetch(
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
        const response = await clientFetch(
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

export function useAddDeleteConversationSkill({
  conversationId,
  workspaceId,
}: {
  conversationId: string | null;
  workspaceId: string;
}) {
  const sendNotification = useSendNotification();
  const addSkill = useCallback(
    async (skillId: string): Promise<boolean> => {
      if (!conversationId) {
        return false;
      }

      try {
        const response = await clientFetch(
          `/api/w/${workspaceId}/assistant/conversations/${conversationId}/skills`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              action: "add",
              skillId,
            } satisfies ConversationSkillActionRequest),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to add skill to conversation");
        }

        const result = await response.json();
        return result.success === true;
      } catch (err) {
        const error = normalizeError(err);
        datadogLogger.error(
          {
            error,
            conversationId,
            workspaceId,
          },
          "[JIT Skill] Error adding skill to conversation"
        );
        sendNotification({
          type: "error",
          title: "Failed to add skill to conversation",
          description: error.message,
        });
        return false;
      }
    },
    [conversationId, workspaceId, sendNotification]
  );

  const deleteSkill = useCallback(
    async (skillId: string): Promise<boolean> => {
      if (!conversationId) {
        return false;
      }

      try {
        const response = await clientFetch(
          `/api/w/${workspaceId}/assistant/conversations/${conversationId}/skills`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              action: "delete",
              skillId,
            } satisfies ConversationSkillActionRequest),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to remove skill from conversation");
        }

        const result = await response.json();
        return result.success === true;
      } catch (err) {
        const error = normalizeError(err);
        datadogLogger.error(
          {
            error,
            conversationId,
            workspaceId,
            skillId,
          },
          "[JIT Skill] Error removing skill from conversation"
        );
        sendNotification({
          type: "error",
          title: "Failed to remove skill from conversation",
          description: error.message,
        });
        return false;
      }
    },
    [conversationId, workspaceId, sendNotification]
  );

  return { addSkill, deleteSkill };
}

export function useVisualizationRevert({
  workspaceId,
  conversationId,
}: {
  workspaceId: string | null;
  conversationId: string | null;
}) {
  const handleVisualizationRevert = useCallback(
    async ({
      fileId,
      agentConfigurationId,
    }: {
      fileId: string;
      agentConfigurationId: string;
    }): Promise<boolean> => {
      try {
        const response = await clientFetch(
          `/api/w/${workspaceId}/assistant/conversations/${conversationId}/messages`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              content: `Please revert the previous change in ${fileId}`,
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
          throw new Error("Failed to send revert message");
        }

        return true;
      } catch (error) {
        datadogLogger.error({ error }, "Error sending revert message");
        return false;
      }
    },
    [workspaceId, conversationId]
  );

  return {
    handleVisualizationRevert,
  };
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
        const response = await clientFetch(
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
  conversationId: string;
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

export function useAgentMessageSkills({
  owner,
  conversation,
  messageId,
  options,
}: {
  owner: LightWorkspaceType;
  conversation: ConversationWithoutContentType | null;
  messageId: string | null;
  options?: {
    disabled: boolean;
  };
}) {
  const skillsFetcher: Fetcher<GetAgentMessageSkillsResponseBody> = fetcher;

  const { data, error, isLoading } = useSWRWithDefaults(
    conversation && messageId
      ? `/api/w/${owner.sId}/assistant/conversations/${conversation.sId}/messages/${messageId}/skills`
      : null,
    skillsFetcher,
    options
  );

  return {
    skills: data?.skills ?? emptyArray(),
    isSkillsLoading: !options?.disabled && isLoading,
    isSkillsError: error,
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
        const response = await clientFetch(
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
          void mutateConversations(
            (prevState) => ({
              ...prevState,
              conversations:
                prevState?.conversations.map((c) =>
                  c.sId === conversationId ? { ...c, unread: false } : c
                ) ?? [],
            }),
            { revalidate: false }
          );
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

export type ConversationParticipationOption = "join" | "leave" | "delete";

export const useConversationParticipationOption = ({
  ownerId,
  conversationId,
  userId,
  disabled,
}: {
  ownerId: string;
  conversationId: string | null;
  userId: string | null;
  disabled: boolean;
}) => {
  const { conversationParticipants } = useConversationParticipants({
    conversationId,
    workspaceId: ownerId,
    options: { disabled },
  });
  const [options, setOptions] = useState<ConversationParticipationOption[]>([]);

  useEffect(() => {
    if (conversationParticipants === undefined) {
      setOptions([]);
      return;
    }
    const isUserParticipating =
      userId !== null &&
      conversationParticipants?.users.find(
        (participant) => participant.sId === userId
      );

    const isLastParticipant =
      isUserParticipating && conversationParticipants?.users.length === 1;

    const isConversationCreator =
      userId !== null &&
      conversationParticipants?.users.find(
        (participant) => participant.sId === userId && participant.isCreator
      );

    if (isLastParticipant) {
      setOptions(["delete"]);
    } else if (isConversationCreator) {
      setOptions(["leave", "delete"]);
    } else if (isUserParticipating) {
      setOptions(["leave"]);
    } else {
      setOptions(["join"]);
    }
  }, [conversationParticipants, userId]);

  return options;
};

export const useJoinConversation = ({
  ownerId,
  conversationId,
}: {
  ownerId: string;
  conversationId: string | null;
}): (() => Promise<boolean>) => {
  const sendNotification = useSendNotification();

  const { mutateConversations } = useConversations({
    workspaceId: ownerId,
    options: { disabled: true },
  });
  const { mutateConversationParticipants } = useConversationParticipants({
    conversationId,
    workspaceId: ownerId,
    options: { disabled: true },
  });

  const joinConversation = useCallback(async (): Promise<boolean> => {
    if (!conversationId) {
      return false;
    }
    try {
      const response = await clientFetch(
        `/api/w/${ownerId}/assistant/conversations/${conversationId}/participants`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      if (!response.ok) {
        const { error } = await response.json();
        if (error.type === "user_already_participant") {
          sendNotification({
            type: "error",
            title: "Already subscribed",
            description: "You are already a participant in this conversation.",
          });
          return false;
        }

        throw new Error("Failed to subscribe to the conversation.");
      }
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (error) {
      sendNotification({
        type: "error",
        title: "Error",
        description: "Failed to subscribe to the conversation.",
      });
      return false;
    }

    sendNotification({
      type: "success",
      title: "Subscribed!",
      description: "You have been added to this conversation.",
    });

    void mutateConversations();
    void mutateConversationParticipants();

    return true;
  }, [
    ownerId,
    sendNotification,
    mutateConversations,
    mutateConversationParticipants,
    conversationId,
  ]);

  return joinConversation;
};

export function usePostOnboardingFollowUp({
  workspaceId,
  conversationId,
}: {
  workspaceId: string;
  conversationId: string | null;
}) {
  const sendNotification = useSendNotification();

  const postFollowUp = useCallback(
    async (toolId: string): Promise<boolean> => {
      if (!conversationId) {
        return false;
      }
      try {
        const response = await clientFetch(
          `/api/w/${workspaceId}/assistant/conversations/${conversationId}/onboarding-followup`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ toolId }),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to post onboarding follow-up");
        }

        return true;
      } catch (error) {
        datadogLogger.error("Error posting onboarding follow-up", {
          error,
          workspaceId,
          conversationId,
          toolId,
        });
        sendNotification({
          type: "error",
          title: "Failed to send follow-up message",
        });
        return false;
      }
    },
    [workspaceId, conversationId, sendNotification]
  );

  return { postFollowUp };
}
