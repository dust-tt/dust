import {
  ArrowDownIcon,
  ArrowPathIcon,
  ArrowUpIcon,
  Button,
  ContentMessageAction,
  ContentMessageInline,
  IconButton,
  InformationCircleIcon,
  StopIcon,
} from "@dust-tt/sparkle";
import {
  useVirtuosoLocation,
  useVirtuosoMethods,
} from "@virtuoso.dev/message-list";
import { useContext, useEffect, useMemo, useState } from "react";

import { useBlockedActionsContext } from "@app/components/assistant/conversation/BlockedActionsProvider";
import { GenerationContext } from "@app/components/assistant/conversation/GenerationContextProvider";
import { InputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import type {
  VirtuosoMessage,
  VirtuosoMessageListContext,
} from "@app/components/assistant/conversation/types";
import {
  isHandoverUserMessage,
  isHiddenMessage,
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
  const { getBlockedActions, hasPendingValidations, startPulsingAction } =
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

  const { bottomOffset, listOffset, visibleListHeight } = useVirtuosoLocation();

  // Memoize message positions separately - only recalculate when messages change, not on scroll.
  const { userMessageIndices, positions } = useMemo(() => {
    const allMessages = methods.data.get();

    // Find indices of visible (non-hidden) user messages.
    const userIndices: number[] = [];
    for (let i = 0; i < allMessages.length; i++) {
      const msg = allMessages[i];
      if (isUserMessage(msg) && !isHiddenMessage(msg)) {
        userIndices.push(i);
      }
    }

    // Calculate positions by accumulating heights.
    const pos: { top: number; bottom: number }[] = [];
    let accumulatedHeight = 0;
    for (const msg of allMessages) {
      const height = methods.height(msg);
      pos.push({
        top: accumulatedHeight,
        bottom: accumulatedHeight + height,
      });
      accumulatedHeight += height;
    }

    return { userMessageIndices: userIndices, positions: pos };
  }, [methods]);

  // Determine navigable messages based on viewport position.
  const {
    canScrollUp,
    canScrollDown,
    scrollToPreviousUserMessage,
    scrollToNextUserMessage,
  } = useMemo(() => {
    // Convert listOffset to positive scroll position.
    // listOffset is negative when scrolled down (distance from list top to viewport top).
    const viewportTop = -listOffset;
    const viewportTopQuarter = viewportTop + visibleListHeight / 4;

    // Find user messages fully above viewport (for arrow up).
    const fullyAboveIndices = userMessageIndices.filter(
      (idx) => positions[idx] && positions[idx].bottom <= viewportTop
    );

    // Find user messages whose top is below the top quarter of viewport (for arrow down).
    const belowTopQuarterIndices = userMessageIndices.filter(
      (idx) => positions[idx] && positions[idx].top >= viewportTopQuarter
    );

    const canUp = fullyAboveIndices.length > 0;
    const canDown = belowTopQuarterIndices.length > 0 || bottomOffset > 0;

    return {
      canScrollUp: canUp,
      canScrollDown: canDown,
      scrollToPreviousUserMessage: () => {
        if (fullyAboveIndices.length > 0) {
          // Scroll to the last user message that's fully above (closest to current view).
          const targetIndex = fullyAboveIndices[fullyAboveIndices.length - 1];
          methods.scrollToItem({
            index: targetIndex,
            align: "start",
            behavior: "smooth",
          });
        }
      },
      scrollToNextUserMessage: () => {
        if (belowTopQuarterIndices.length > 0) {
          // Scroll to the first user message below top quarter.
          const targetIndex = belowTopQuarterIndices[0];
          methods.scrollToItem({
            index: targetIndex,
            align: "start",
            behavior: "smooth",
          });
        } else if (bottomOffset > 0) {
          // No more user messages below, but there's content - scroll to bottom.
          methods.scrollToItem({
            index: "LAST",
            align: "end",
            behavior:
              bottomOffset < MAX_DISTANCE_FOR_SMOOTH_SCROLL
                ? "smooth"
                : "instant",
          });
        }
      },
    };
  }, [
    userMessageIndices,
    positions,
    listOffset,
    visibleListHeight,
    bottomOffset,
    methods,
  ]);

  const showClearButton =
    context.agentBuilderContext?.resetConversation &&
    generatingMessages.length > 0;
  const showStopButton = generatingMessages.length > 0;
  const blockedActions = getBlockedActions(context.user.sId);

  // Keep blockedActionIndex in sync when blockedActions array changes.
  useEffect(() => {
    // Clamp index to valid range: [0, length-1] when non-empty, or 0 when empty.
    if (blockedActionIndex >= blockedActions.length) {
      setBlockedActionIndex(Math.max(0, blockedActions.length - 1));
    }
  }, [blockedActionIndex, blockedActions.length]);

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
        "relative z-20 mx-auto flex max-h-dvh w-full flex-col py-2 sm:w-full sm:max-w-4xl sm:py-4"
      }
    >
      <div
        className="flex w-full justify-center gap-2"
        style={{
          position: "absolute",
          top: "-2em",
        }}
      >
        <div className="flex items-center gap-1 rounded-full border border-border bg-white px-1 py-0.5 dark:border-border-night dark:bg-muted-night">
          <IconButton
            icon={ArrowUpIcon}
            onClick={scrollToPreviousUserMessage}
            disabled={!canScrollUp}
            size="xs"
            tooltip="Previous message"
          />
          <IconButton
            icon={ArrowDownIcon}
            onClick={scrollToNextUserMessage}
            disabled={!canScrollDown}
            size="xs"
            tooltip="Next message"
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
          className="mb-5 flex max-h-dvh w-full"
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
                const blockedAction = blockedActions[blockedActionIndex];
                const blockedActionTargetMessageId = blockedAction.messageId;

                startPulsingAction(blockedAction.actionId);

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
