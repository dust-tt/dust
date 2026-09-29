import type { OngoingAgentLoopsSnapshot } from "@app/components/assistant/conversation/AgentLoopStreamContext";
import type { VirtuosoMessage } from "@app/components/assistant/conversation/types";
import {
  isAgentMessageWithStreaming,
  isPlaceholderMessage,
} from "@app/components/assistant/conversation/types";
import datadogLogger from "@app/logger/datadogLogger";
import type { ConversationWithoutContentType } from "@app/types/assistant/conversation";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { LightWorkspaceType } from "@app/types/user";
import type { RefObject } from "react";
import { useEffect, useRef } from "react";

interface UseRecoverStaleConversationMessagesParams {
  conversation: ConversationWithoutContentType | undefined;
  owner: LightWorkspaceType;
  disabled: boolean;
  isLoadingInitialData: boolean;
  isValidating: boolean;
  isMessagesError: boolean;
  ongoingLoopsSnapshot: OngoingAgentLoopsSnapshot | null;
  messageListRef: RefObject<{ data: { get: () => VirtuosoMessage[] } }>;
  mutateMessages: () => Promise<unknown>;
}

/**
 * @cc [owner:id13,label:react;reliability] registry-recovers-stale-conversation-messages
 * After a successful ongoing-loop registry response, a mounted conversation whose non-placeholder
 * streaming message IDs disagree with its registry message IDs MUST revalidate persisted messages
 * once per distinct disagreement; a failed revalidation MUST permit retry on a later registry response.
 * Unavailable registry or list data MUST NOT trigger revalidation.
 */
export function useRecoverStaleConversationMessages({
  conversation,
  owner,
  disabled,
  isLoadingInitialData,
  isValidating,
  isMessagesError,
  ongoingLoopsSnapshot,
  messageListRef,
  mutateMessages,
}: UseRecoverStaleConversationMessagesParams): void {
  const conversationId = conversation?.sId;
  const workspaceId = owner.sId;
  const lastRegistryMismatch = useRef<string | null>(null);

  useEffect(() => {
    if (
      disabled ||
      !conversation ||
      isLoadingInitialData ||
      isValidating ||
      isMessagesError ||
      !ongoingLoopsSnapshot ||
      ongoingLoopsSnapshot.workspaceId !== workspaceId
    ) {
      return;
    }
    const localMessages = messageListRef.current?.data.get();
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
      void mutateMessages().catch((error: unknown) => {
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
    conversation,
    conversationId,
    disabled,
    isLoadingInitialData,
    isMessagesError,
    isValidating,
    messageListRef,
    mutateMessages,
    ongoingLoopsSnapshot,
    workspaceId,
  ]);
}
