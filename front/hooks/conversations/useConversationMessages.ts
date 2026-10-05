import { useOngoingAgentLoopsSnapshot } from "@app/components/assistant/conversation/AgentLoopStreamContext";
import type { VirtuosoMessage } from "@app/components/assistant/conversation/types";
import {
  isAgentMessageWithStreaming,
  isPlaceholderMessage,
} from "@app/components/assistant/conversation/types";
import {
  useFetcher,
  useSWRInfiniteWithDefaults,
  useSWRWithDefaults,
} from "@app/lib/swr/swr";
import datadogLogger from "@app/logger/datadogLogger";
import type {
  FetchConversationMessageActionResponse,
  FetchConversationMessagesResponse,
} from "@app/types/api/assistant/messages";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { RefObject } from "react";
import { useEffect, useMemo, useRef } from "react";
import type { Fetcher } from "swr";

export const CONVERSATION_MESSAGES_PAGE_LIMIT = 50;

/**
 * @cc [owner:id13,label:react;reliability] registry-recovers-stale-conversation-messages
 * After a successful ongoing-loop registry response, a mounted conversation whose non-placeholder
 * streaming message IDs disagree with its registry message IDs MUST revalidate persisted messages
 * once per distinct disagreement; a failed revalidation MUST permit retry on a later registry response.
 * Unavailable registry or list data MUST NOT trigger revalidation.
 */
export function useConversationMessages({
  conversationId,
  workspaceId,
  limit,
  disabled = false,
  messageListRef,
}: {
  conversationId?: string | null;
  workspaceId: string;
  limit: number;
  startAtRank?: number;
  disabled?: boolean;
  messageListRef?: RefObject<{ data: { get: () => VirtuosoMessage[] } }>;
}) {
  const ongoingLoopsSnapshot = useOngoingAgentLoopsSnapshot();
  const lastRegistryMismatch = useRef<string | null>(null);
  const { fetcher } = useFetcher();
  const messagesFetcher: Fetcher<FetchConversationMessagesResponse> = fetcher;

  const { data, error, mutate, size, setSize, isLoading, isValidating } =
    useSWRInfiniteWithDefaults(
      (pageIndex: number, previousPageData) => {
        if (disabled || !conversationId) {
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

  useEffect(() => {
    if (
      disabled ||
      !conversationId ||
      !data ||
      isValidating ||
      error ||
      !ongoingLoopsSnapshot ||
      ongoingLoopsSnapshot.workspaceId !== workspaceId
    ) {
      return;
    }
    const localMessages = messageListRef?.current?.data.get();
    if (!localMessages) {
      return;
    }
    const localIds = localMessages
      .filter(
        (message) =>
          isAgentMessageWithStreaming(message) &&
          message.status === "created" &&
          !isPlaceholderMessage(message)
      )
      .map((message) => message.sId)
      .sort();
    const registryIds = ongoingLoopsSnapshot.agentLoops
      .filter((loop) => loop.conversationId === conversationId)
      .map((loop) => loop.messageId)
      .sort();

    if (
      registryIds.length === localIds.length &&
      registryIds.every((id, index) => id === localIds[index])
    ) {
      lastRegistryMismatch.current = null;
      return;
    }

    const mismatch = JSON.stringify([conversationId, registryIds, localIds]);
    if (lastRegistryMismatch.current !== mismatch) {
      lastRegistryMismatch.current = mismatch;
      void mutate().catch((error: unknown) => {
        if (lastRegistryMismatch.current === mismatch) {
          lastRegistryMismatch.current = null;
        }
        datadogLogger.error(
          { err: normalizeError(error), conversationId, workspaceId },
          "Failed to recover stale conversation messages."
        );
      });
    }
  }, [
    conversationId,
    disabled,
    data,
    error,
    isValidating,
    messageListRef,
    mutate,
    ongoingLoopsSnapshot,
    workspaceId,
  ]);

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

export function useConversationMessageAction({
  conversationId,
  workspaceId,
  messageId,
  actionId,
}: {
  conversationId: string;
  workspaceId: string;
  messageId: string;
  actionId: string | null;
}) {
  const { fetcher } = useFetcher();
  const actionFetcher: Fetcher<FetchConversationMessageActionResponse> =
    fetcher;

  const { data, error, mutate, isLoading } = useSWRWithDefaults(
    actionId
      ? `/api/w/${workspaceId}/assistant/conversations/${conversationId}/messages/${messageId}/actions/${actionId}`
      : null,
    actionFetcher
  );

  return {
    action: data?.action,
    messageStatus: data?.messageStatus,
    isActionLoading: isLoading,
    isActionError: error,
    mutateAction: mutate,
  };
}
