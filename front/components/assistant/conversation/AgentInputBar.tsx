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
import { ProjectJoinCTA } from "@app/components/spaces/ProjectJoinCTA";
import { useCancelMessage, useConversation } from "@app/lib/swr/conversations";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import {
  isRichAgentMention,
  toRichAgentMentionType,
} from "@app/types/assistant/mentions";
import { pluralize } from "@app/types/shared/utils/string_utils";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  Button,
  ContentMessageAction,
  ContentMessageInline,
  IconButton,
  InformationCircleIcon,
  StopIcon,
  useCopyToClipboard,
  XMarkIcon,
} from "@dust-tt/sparkle";
import {
  useVirtuosoLocation,
  useVirtuosoMethods,
} from "@virtuoso.dev/message-list";
import { useCallback, useContext, useEffect, useMemo, useState } from "react";

const MAX_DISTANCE_FOR_SMOOTH_SCROLL = 2048;

export const AgentInputBar = ({
  context,
}: {
  context: VirtuosoMessageListContext;
}) => {
  const [blockedActionIndex, setBlockedActionIndex] = useState<number>(0);
  const [isStopping, setIsStopping] = useState<boolean>(false);
  const generationContext = useContext(GenerationContext);
  const { getBlockedActions, hasPendingValidations, startPulsingAction } =
    useBlockedActionsContext();

  const { mutateConversation } = useConversation({
    conversationId: context.conversation?.sId,
    workspaceId: context.owner.sId,
    options: { disabled: true }, // We just want to get the mutation function
  });
  const cancelMessage = useCancelMessage({
    owner: context.owner,
    conversationId: context.conversation?.sId,
  });

  const isMobile = useIsMobile();
  const methods = useVirtuosoMethods<VirtuosoMessage>();
  const { bottomOffset, listOffset, visibleListHeight } = useVirtuosoLocation();

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

    // We only prefill if there is only one agent mention in user's previous message.
    const shouldPrefill =
      lastUserMessage &&
      lastUserMessage.richMentions.length === 1 &&
      isRichAgentMention(lastUserMessage.richMentions[0]);

    if (!shouldPrefill) {
      return [];
    }

    return lastUserMessage.richMentions;
  }, [draftAgent, lastUserMessage]);

  // Calculate positions and determine which user messages are navigable.
  const {
    canScrollUp,
    canScrollDown,
    scrollToPreviousUserMessage,
    scrollToNextUserMessage,
  } = useMemo(() => {
    const allMessages = methods.data.get();

    // Find indices of visible (non-hidden) user messages.
    const userMessageIndices: number[] = [];
    for (let i = 0; i < allMessages.length; i++) {
      const msg = allMessages[i];
      if (isUserMessage(msg) && !isHiddenMessage(msg)) {
        userMessageIndices.push(i);
      }
    }

    // Calculate positions by accumulating heights.
    const positions: { top: number; bottom: number }[] = [];
    let accumulatedHeight = 0;
    for (const msg of allMessages) {
      const height = methods.height(msg);
      positions.push({
        top: accumulatedHeight,
        bottom: accumulatedHeight + height,
      });
      accumulatedHeight += height;
    }

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
    const canDown =
      (belowTopQuarterIndices.length > 0 || bottomOffset > 0) &&
      !methods.getScrollLocation().isAtBottom;

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
  }, [methods, listOffset, visibleListHeight, bottomOffset]);

  const blockedActions = getBlockedActions(context.user.sId);

  // Keep blockedActionIndex in sync when blockedActions array changes.
  useEffect(() => {
    // Clamp index to valid range: [0, length-1] when non-empty, or 0 when empty.
    if (blockedActionIndex >= blockedActions.length) {
      setBlockedActionIndex(Math.max(0, blockedActions.length - 1));
    }
  }, [blockedActionIndex, blockedActions.length]);

  useEffect(() => {
    if (
      isStopping &&
      generationContext &&
      !generationContext.generatingMessages.some(
        (m) => m.conversationId === context.conversation?.sId
      )
    ) {
      setIsStopping(false);
    }
  }, [isStopping, generationContext, context.conversation]);

  if (!generationContext) {
    throw new Error(
      "AssistantInputBarVirtuoso must be used within a GenerationContextProvider"
    );
  }

  if (
    context.isProjectMember === false &&
    context.projectSpaceId &&
    context.projectSpaceName
  ) {
    return (
      <div className="relative z-20 mx-auto flex max-h-dvh w-full flex-col py-2 sm:w-full sm:max-w-4xl sm:py-4">
        <ProjectJoinCTA
          owner={context.owner}
          spaceId={context.projectSpaceId}
          spaceName={context.projectSpaceName}
          isRestricted={context.isProjectRestricted ?? false}
          userName={context.user.fullName}
        />
      </div>
    );
  }

  const generatingMessages =
    generationContext.getConversationGeneratingMessages(
      context.conversation?.sId ?? ""
    );

  const showStopButton = generatingMessages.length > 0;
  const showMessageNavigation = !context.agentBuilderContext;
  const showNavigationContainer = showStopButton || showMessageNavigation;

  const getStopButtonLabel = () => {
    if (isStopping) {
      return "Stopping...";
    }

    return generatingMessages.length > 1 ? "Stop all" : "Stop";
  };

  const handleStopGeneration = async () => {
    if (!context.conversation) {
      return;
    }
    setIsStopping(true); // We don't set it back to false immediately cause it takes a bit of time to cancel.
    await cancelMessage(
      generationContext.generatingMessages
        .filter((m) => m.conversationId === context.conversation?.sId)
        .map((m) => m.messageId)
    );
    void mutateConversation();
  };

  return (
    <div
      className={
        "relative z-20 mx-auto flex max-h-dvh w-full flex-col py-2 sm:w-full sm:max-w-4xl sm:py-4"
      }
    >
      <div className="flex w-full justify-center gap-2">
        {showNavigationContainer && (
          <div
            className="flex items-center gap-1 rounded-xl border border-border bg-white p-1 dark:border-border-night dark:bg-muted-night"
            style={{
              position: "absolute",
              top: "-2em",
            }}
          >
            {showStopButton && (
              <>
                <Button
                  variant="ghost"
                  label={getStopButtonLabel()}
                  icon={StopIcon}
                  onClick={handleStopGeneration}
                  disabled={isStopping}
                  size="xs"
                />
                {showMessageNavigation && (
                  <div className="h-4 w-px bg-border dark:bg-border-night" />
                )}
              </>
            )}
            {showMessageNavigation && (
              <>
                <IconButton
                  icon={ArrowUpIcon}
                  onClick={scrollToPreviousUserMessage}
                  disabled={!canScrollUp}
                  size="xs"
                  tooltip="Previous user message"
                />
                <IconButton
                  icon={ArrowDownIcon}
                  onClick={scrollToNextUserMessage}
                  disabled={!canScrollDown}
                  size="xs"
                  tooltip="Next user message"
                />
              </>
            )}
          </div>
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
        conversation={context.conversation}
        draftKey={context.draftKey}
        disableAutoFocus={isMobile}
        actions={context.agentBuilderContext?.actionsToShow}
        isSubmitting={context.agentBuilderContext?.isSubmitting === true}
      />
      {context.agentBuilderContext?.resetConversation &&
        context.conversation && (
          <CopilotConversationFooter
            conversationId={context.conversation.sId}
            onReset={context.agentBuilderContext.resetConversation}
          />
        )}
    </div>
  );
};

interface CopilotConversationFooterProps {
  conversationId: string;
  onReset: () => void;
}

const CopilotConversationFooter = ({
  conversationId,
  onReset,
}: CopilotConversationFooterProps) => {
  const [, copyToClipboard] = useCopyToClipboard();

  const handleCopyId = useCallback(async () => {
    await copyToClipboard(conversationId);
  }, [copyToClipboard, conversationId]);

  return (
    <div className="flex items-center justify-center gap-4 pt-2 text-xs text-muted-foreground dark:text-muted-foreground-night">
      <button
        onClick={onReset}
        className="flex items-center gap-1 hover:text-foreground dark:hover:text-foreground-night"
      >
        <XMarkIcon className="h-3 w-3" />
        <span>Reset copilot</span>
      </button>
      <button
        onClick={handleCopyId}
        className="text-muted-foreground/60 hover:text-muted-foreground dark:text-muted-foreground-night/60 dark:hover:text-muted-foreground-night"
        title="Click to copy"
      >
        ID: {conversationId}
      </button>
    </div>
  );
};
