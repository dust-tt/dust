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

interface UserMessageVisibilityInfo {
  messageIndex: number; // Index in messages array
  userMsgIndex: number; // Index among user messages (0, 1, 2...)
  isVisible: boolean;
  isAboveViewport: boolean;
  isBelowMiddle: boolean;
}

const MAX_DISTANCE_FOR_SMOOTH_SCROLL = 2048;
const BOTTOM_THRESHOLD = 100;

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

  const { bottomOffset, listOffset, visibleListHeight } = useVirtuosoLocation();
  const showClearButton =
    context.agentBuilderContext?.resetConversation &&
    generatingMessages.length > 0;
  const showStopButton = generatingMessages.length > 0;
  const blockedActions = getBlockedActions(context.user.sId);

  // Calculate which user messages are visible based on scroll position and item heights
  const getVisibleUserMessages =
    useCallback((): UserMessageVisibilityInfo[] => {
      const messages = methods.data.get();
      const visibleStart = Math.abs(listOffset);
      const visibleEnd = visibleStart + visibleListHeight;
      const viewportMiddle = visibleStart + visibleListHeight / 2;

      const userMsgInfo: UserMessageVisibilityInfo[] = [];
      let cumHeight = 0;
      let userMsgCounter = 0;

      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const msgHeight = methods.height(msg);
        const msgTop = cumHeight;
        const msgBottom = cumHeight + msgHeight;
        const msgCenter = (msgTop + msgBottom) / 2;

        if (isUserMessage(msg)) {
          userMsgInfo.push({
            messageIndex: i,
            userMsgIndex: userMsgCounter,
            isVisible: msgBottom > visibleStart && msgTop < visibleEnd,
            isAboveViewport: msgBottom <= visibleStart,
            isBelowMiddle: msgCenter > viewportMiddle,
          });
          userMsgCounter++;
        }
        cumHeight += msgHeight;
      }

      return userMsgInfo;
    }, [methods, listOffset, visibleListHeight]);

  // Compute disabled states based on visibility
  const { canGoUp, canGoDown } = useMemo(() => {
    const userMsgs = getVisibleUserMessages();
    if (userMsgs.length === 0) {
      return { canGoUp: false, canGoDown: false };
    }

    // UP disabled: first user message is visible
    const firstUserMsgVisible = userMsgs[0].isVisible;

    // DOWN disabled: at bottom of conversation
    const atBottom = bottomOffset < BOTTOM_THRESHOLD;

    return {
      canGoUp: !firstUserMsgVisible,
      canGoDown: !atBottom,
    };
  }, [getVisibleUserMessages, bottomOffset]);

  const scrollToPreviousUserMessage = useCallback(() => {
    const userMsgs = getVisibleUserMessages();
    if (userMsgs.length === 0) {
      return;
    }

    // Find first visible user message
    const firstVisibleIdx = userMsgs.findIndex((m) => m.isVisible);
    if (firstVisibleIdx === -1 || firstVisibleIdx === 0) {
      return; // No visible user messages or already at first
    }

    // Target is the user message just before first visible
    const target = userMsgs[firstVisibleIdx - 1];
    const distance = Math.abs(listOffset);

    methods.scrollToItem({
      index: target.messageIndex,
      align: "start",
      behavior:
        distance < MAX_DISTANCE_FOR_SMOOTH_SCROLL ? "smooth" : "instant",
    });
  }, [getVisibleUserMessages, listOffset, methods]);

  const scrollToNextUserMessage = useCallback(() => {
    const userMsgs = getVisibleUserMessages();
    if (userMsgs.length === 0) {
      return;
    }

    // Find first user message below middle of viewport
    const targetBelowMiddle = userMsgs.find((m) => m.isBelowMiddle);

    if (targetBelowMiddle) {
      // Scroll to bring this user message to the top
      const distance = Math.abs(listOffset);
      methods.scrollToItem({
        index: targetBelowMiddle.messageIndex,
        align: "start",
        behavior:
          distance < MAX_DISTANCE_FOR_SMOOTH_SCROLL ? "smooth" : "instant",
      });
      return;
    }

    // No user message below middle - scroll to bottom (for long agent responses)
    const distance = Math.abs(listOffset);
    methods.scrollToItem({
      index: "LAST",
      align: "end",
      behavior:
        distance < MAX_DISTANCE_FOR_SMOOTH_SCROLL ? "smooth" : "instant",
    });
  }, [getVisibleUserMessages, listOffset, methods]);

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
