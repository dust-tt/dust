import {
  ArrowDownIcon,
  ArrowPathIcon,
  ArrowUpIcon,
  Button,
  ContentMessageAction,
  ContentMessageInline,
  InformationCircleIcon,
  StopIcon,
  Tooltip,
} from "@dust-tt/sparkle";
import {
  useVirtuosoLocation,
  useVirtuosoMethods,
} from "@virtuoso.dev/message-list";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";

import { useBlockedActionsContext } from "@app/components/assistant/conversation/BlockedActionsProvider";
import { GenerationContext } from "@app/components/assistant/conversation/GenerationContextProvider";
import { InputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import type {
  VirtuosoMessage,
  VirtuosoMessageListContext,
} from "@app/components/assistant/conversation/types";
import {
  isHandoverUserMessage,
  isMessageTemporayState,
  isUserMessage,
} from "@app/components/assistant/conversation/types";
import { useCancelMessage, useConversation } from "@app/lib/swr/conversations";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import {
  isRichAgentMention,
  pluralize,
  toRichAgentMentionType,
} from "@app/types";

const MAX_DISTANCE_FOR_SMOOTH_SCROLL = 2048;

export const AgentInputBar = ({
  context,
}: {
  context: VirtuosoMessageListContext;
}) => {
  const [blockedActionIndex, setBlockedActionIndex] = useState<number>(0);
  const generationContext = useContext(GenerationContext);
  const { getBlockedActions, hasPendingValidations } =
    useBlockedActionsContext();

  if (!generationContext) {
    throw new Error(
      "AssistantInputBarVirtuoso must be used within a GenerationContextProvider"
    );
  }

  const { mutateConversation } = useConversation({
    conversationId: context.conversationId,
    workspaceId: context.owner.sId,
    options: { disabled: true }, // We just want to get the mutation function
  });
  const cancelMessage = useCancelMessage({
    owner: context.owner,
    conversationId: context.conversationId,
  });

  const generatingMessages =
    generationContext.getConversationGeneratingMessages(context.conversationId);

  const isMobile = useIsMobile();
  const methods = useVirtuosoMethods<VirtuosoMessage>();
  const lastUserMessage = methods.data
    .get()
    .filter(isUserMessage)
    .findLast(
      (m) =>
        !isHandoverUserMessage(m) &&
        m.user?.id === context.user.id &&
        m.visibility !== "deleted"
    );

  const draftAgent = context.agentBuilderContext?.draftAgent;

  const autoMentions = useMemo(() => {
    // If we are in the agent builder, we show the draft agent as the sticky mention, all the time.
    // Especially since the draft agent have a new sId every time it is updated.
    if (draftAgent) {
      return [toRichAgentMentionType(draftAgent)];
    }

    // we only prefill if there is only one agent mention in user's previous message
    const shouldPrefill =
      lastUserMessage &&
      lastUserMessage.richMentions.length === 1 &&
      isRichAgentMention(lastUserMessage.richMentions[0]);

    if (!shouldPrefill) {
      return [];
    }

    return lastUserMessage.richMentions;
  }, [draftAgent, lastUserMessage]);

  const { bottomOffset, listOffset } = useVirtuosoLocation();
  const showClearButton =
    context.agentBuilderContext?.resetConversation &&
    generatingMessages.length > 0;
  const showStopButton = generatingMessages.length > 0;
  const blockedActions = getBlockedActions(context.user.sId);

  // Track current user message index for navigation
  // null means "at the bottom" (past the last user message)
  const [currentUserMessageIndex, setCurrentUserMessageIndex] = useState<
    number | null
  >(null);

  // Helper to get user message indices (called when needed, not memoized on methods.data)
  const getUserMessageIndices = useCallback(() => {
    const messages = methods.data.get();
    const indices: number[] = [];
    messages.forEach((m, index) => {
      if (isUserMessage(m)) {
        indices.push(index);
      }
    });
    return indices;
  }, [methods]);

  // Compute disabled states based on current position
  const getNavigationState = useCallback(() => {
    const indices = getUserMessageIndices();
    const hasUserMessages = indices.length > 0;

    // When at bottom (null), up is active if there are user messages, down is disabled
    if (currentUserMessageIndex === null) {
      return {
        canGoUp: hasUserMessages,
        canGoDown: false,
      };
    }

    return {
      canGoUp: currentUserMessageIndex > 0,
      canGoDown: currentUserMessageIndex < indices.length - 1,
    };
  }, [getUserMessageIndices, currentUserMessageIndex]);

  const { canGoUp, canGoDown } = getNavigationState();

  const scrollToPreviousUserMessage = useCallback(() => {
    const indices = getUserMessageIndices();
    if (indices.length === 0) {
      return;
    }

    let targetIndex: number;
    if (currentUserMessageIndex === null) {
      // Start from the last user message
      targetIndex = indices.length - 1;
    } else if (currentUserMessageIndex > 0) {
      targetIndex = currentUserMessageIndex - 1;
    } else {
      return; // Already at first
    }

    const messageIndex = indices[targetIndex];
    const distance = Math.abs(listOffset);
    methods.scrollToItem({
      index: messageIndex,
      align: "start",
      behavior:
        distance < MAX_DISTANCE_FOR_SMOOTH_SCROLL ? "smooth" : "instant",
    });
    setCurrentUserMessageIndex(targetIndex);
  }, [getUserMessageIndices, currentUserMessageIndex, listOffset, methods]);

  const scrollToNextUserMessage = useCallback(() => {
    const indices = getUserMessageIndices();
    if (indices.length === 0) {
      return;
    }

    let targetIndex: number;
    if (currentUserMessageIndex === null) {
      // Start from the first user message
      targetIndex = 0;
    } else if (currentUserMessageIndex < indices.length - 1) {
      targetIndex = currentUserMessageIndex + 1;
    } else {
      return; // Already at last
    }

    const messageIndex = indices[targetIndex];
    const distance = Math.abs(listOffset);
    methods.scrollToItem({
      index: messageIndex,
      align: "start",
      behavior:
        distance < MAX_DISTANCE_FOR_SMOOTH_SCROLL ? "smooth" : "instant",
    });
    setCurrentUserMessageIndex(targetIndex);
  }, [getUserMessageIndices, currentUserMessageIndex, listOffset, methods]);

  // Reset navigation state when scrolling back to bottom
  const BOTTOM_THRESHOLD = 100;
  useEffect(() => {
    if (bottomOffset < BOTTOM_THRESHOLD) {
      setCurrentUserMessageIndex(null);
    }
  }, [bottomOffset]);

  const [isStopping, setIsStopping] = useState<boolean>(false);

  const getStopButtonLabel = () => {
    if (isStopping) {
      return "Stopping...";
    }

    return generatingMessages.length > 1 ? "Stop all" : "Stop";
  };

  const handleStopGeneration = async () => {
    if (!context.conversationId) {
      return;
    }
    setIsStopping(true); // we don't set it back to false immediately cause it takes a bit of time to cancel
    await cancelMessage(
      generationContext.generatingMessages
        .filter((m) => m.conversationId === context.conversationId)
        .map((m) => m.messageId)
    );
    void mutateConversation();
  };

  useEffect(() => {
    if (
      isStopping &&
      !generationContext.generatingMessages.some(
        (m) => m.conversationId === context.conversationId
      )
    ) {
      setIsStopping(false);
    }
  }, [
    isStopping,
    generationContext.generatingMessages,
    context.conversationId,
  ]);

  return (
    <div
      className={
        "max-h-dvh relative z-20 mx-auto flex w-full flex-col py-2 sm:w-full sm:max-w-4xl sm:py-4"
      }
    >
      <div
        className="flex w-full justify-center gap-2"
        style={{
          position: "absolute",
          top: "-2em",
        }}
      >
        <div className="flex rounded-xl border border-border bg-white dark:bg-muted-background-night">
          <Tooltip
            label="Go to previous message"
            side="top"
            trigger={
              <Button
                icon={ArrowUpIcon}
                variant="ghost"
                onClick={scrollToPreviousUserMessage}
                disabled={!canGoUp}
              />
            }
          />
          <Tooltip
            label="Go to next message"
            side="top"
            trigger={
              <Button
                icon={ArrowDownIcon}
                variant="ghost"
                onClick={scrollToNextUserMessage}
                disabled={!canGoDown}
              />
            }
          />
        </div>

        {showClearButton && (
          <Button
            variant="outline"
            icon={ArrowPathIcon}
            onClick={context.agentBuilderContext?.resetConversation}
            label="Clear"
          />
        )}

        {showStopButton && (
          <Button
            variant="outline"
            label={getStopButtonLabel()}
            icon={StopIcon}
            onClick={handleStopGeneration}
            disabled={isStopping}
          />
        )}
      </div>
      {blockedActions.length > 0 && (
        <ContentMessageInline
          icon={InformationCircleIcon}
          variant="primary"
          className="max-h-dvh mb-5 flex w-full"
        >
          <span className="font-bold">
            {blockedActions.length} manual action
            {pluralize(blockedActions.length)}
          </span>{" "}
          required
          {/* If there are pending validations, we show a button allowing to cycle through the blocked actions messages. */}
          {hasPendingValidations(context.user.sId) && (
            <ContentMessageAction
              label="Review"
              variant="outline"
              size="xs"
              onClick={() => {
                const blockedActionTargetMessageId =
                  blockedActions[blockedActionIndex].messageId;

                const blockedActionMessageIndex = methods.data.findIndex(
                  (m) =>
                    isMessageTemporayState(m) &&
                    blockedActionTargetMessageId === m.sId
                );

                methods.scrollToItem({
                  index: blockedActionMessageIndex,
                  behavior: "smooth",
                  align: "end",
                });

                setBlockedActionIndex((prevIndex) =>
                  blockedActions.length > prevIndex + 1 ? prevIndex + 1 : 0
                );
              }}
            />
          )}
        </ContentMessageInline>
      )}
      <InputBar
        owner={context.owner}
        user={context.user}
        onSubmit={context.handleSubmit}
        stickyMentions={autoMentions}
        conversationId={context.conversationId}
        disableAutoFocus={isMobile}
        actions={context.agentBuilderContext?.actionsToShow}
        isSubmitting={context.agentBuilderContext?.isSavingDraftAgent === true}
      />
    </div>
  );
};
