import { useGenerationContext } from "@app/components/assistant/conversation/GenerationContextProvider";
import type { ResponseNavigationState } from "@app/components/assistant/conversation/input_bar/getResponseNavigationState";
import { getResponseNavigationState } from "@app/components/assistant/conversation/input_bar/getResponseNavigationState";
import type { VirtuosoMessage } from "@app/components/assistant/conversation/types";
import { isAgentMessageWithStreaming } from "@app/components/assistant/conversation/types";
import { useVirtuosoMethods } from "@virtuoso.dev/message-list";
import { useState } from "react";

export const MAX_DISTANCE_FOR_SMOOTH_SCROLL = 2048;

interface UseConversationResponseNavigationParams {
  conversationId: string;
  messages: VirtuosoMessage[];
  bottomOffset: number;
}

/**
 * @cc [owner:id13,label:react;product] terminal-answer-does-not-stream
 * Navigation MUST NOT show a streaming answer for a registered agent message whose
 * current list row is no longer `created`. A registered ID without a row remains
 * eligible while the message is being inserted into the list.
 */
export function useConversationResponseNavigation({
  conversationId,
  messages,
  bottomOffset,
}: UseConversationResponseNavigationParams) {
  const { getConversationGeneratingMessages } = useGenerationContext();
  const methods = useVirtuosoMethods<VirtuosoMessage>();
  const generatingMessages = getConversationGeneratingMessages(conversationId);

  // A registered ID can outlive the terminal status of its list row. Keep an
  // ID whose row has not arrived yet, but never show an active answer for a finished row.
  const currentGenerationMessageId = generatingMessages.findLast(
    ({ messageId }) => {
      const message = messages.find(({ sId }) => sId === messageId);
      return (
        !message ||
        (isAgentMessageWithStreaming(message) && message.status === "created")
      );
    }
  )?.messageId;

  const [responseState, setResponseState] = useState<ResponseNavigationState>({
    conversationId,
    generatingMessageId: undefined,
    unseenCompletedMessageId: null,
  });
  // Reconcile during render so the control never paints a stale state after
  // generation completes or the reader reaches the bottom.
  const nextResponseState = getResponseNavigationState(responseState, {
    conversationId,
    generatingMessageId: currentGenerationMessageId,
    atBottom: bottomOffset <= 0,
  });
  if (nextResponseState !== responseState) {
    setResponseState(nextResponseState);
  }

  const completedMessage = messages.find(
    ({ sId }) => sId === nextResponseState.unseenCompletedMessageId
  );
  const responseNavigation: "idle" | "streaming" | "ready" =
    currentGenerationMessageId
      ? "streaming"
      : completedMessage &&
          isAgentMessageWithStreaming(completedMessage) &&
          completedMessage.status === "succeeded" &&
          bottomOffset > 0
        ? "ready"
        : "idle";

  const scrollToResponse = () => {
    const currentIndex = messages.findIndex(
      ({ sId }) => sId === currentGenerationMessageId
    );
    const fallbackIndex = messages.findLastIndex(
      (message) =>
        isAgentMessageWithStreaming(message) && message.status === "created"
    );
    const index =
      responseNavigation === "ready"
        ? ("LAST" as const)
        : currentIndex >= 0
          ? currentIndex
          : fallbackIndex >= 0
            ? fallbackIndex
            : ("LAST" as const);

    methods.scrollToItem({
      index,
      align: "end",
      behavior:
        responseNavigation === "ready" &&
        bottomOffset < MAX_DISTANCE_FOR_SMOOTH_SCROLL
          ? "smooth"
          : "instant",
    });
    if (responseNavigation === "ready") {
      setResponseState((state) => ({
        ...state,
        unseenCompletedMessageId: null,
      }));
    }
  };

  return { responseNavigation, scrollToResponse };
}
