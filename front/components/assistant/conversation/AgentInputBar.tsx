import { useBlockedActionsContext } from "@app/components/assistant/conversation/BlockedActionsProvider";
import { ContextUsageWarningBanner } from "@app/components/assistant/conversation/ContextUsageWarningBanner";
import { useGenerationContext } from "@app/components/assistant/conversation/GenerationContextProvider";
import { InputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import { InputBarMessageNavigation } from "@app/components/assistant/conversation/input_bar/InputBarMessageNavigation";
import { INPUT_BAR_COMPACT_NAV_ENTER_ANIMATION_CLASSES } from "@app/components/assistant/conversation/input_bar/inputBarCompactStyles";
import { useInputBarCompactMode } from "@app/components/assistant/conversation/input_bar/useInputBarCompactMode";
import type {
  VirtuosoMessage,
  VirtuosoMessageListContext,
} from "@app/components/assistant/conversation/types";
import {
  isAgentMessageWithStreaming,
  isCompactionMessage,
  isHandoverUserMessage,
  isHiddenMessage,
  isUserMessage,
} from "@app/components/assistant/conversation/types";
import { UserAnswerRequired } from "@app/components/assistant/conversation/UserAnswerRequired";
import { WakeUpBanner } from "@app/components/assistant/conversation/WakeUpBanner";
import { PodJoinCTA } from "@app/components/pod/conversation/PodJoinCTA";
import {
  useCancelMessage,
  useConversation,
  useConversationContextUsage,
} from "@app/hooks/conversations";
import { CONTEXT_USAGE_PERCENT_THRESHOLDS } from "@app/hooks/conversations/useConversationContextUsage";
import { useRetryMessage } from "@app/hooks/useRetryMessage";
import { useAccessibleAgentIds } from "@app/lib/swr/assistants";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { useConversationWakeUps } from "@app/lib/swr/wakeups";
import { classNames } from "@app/lib/utils";
import {
  isRichAgentMention,
  isRichUserMention,
  toRichAgentMentionType,
} from "@app/types/assistant/mentions";
import { pluralize } from "@app/types/shared/utils/string_utils";
import {
  ContentMessageAction,
  ContentMessageInline,
  EmptyCTA,
  InfoCircle,
  MOTION_DURATIONS,
  MOTION_EASINGS,
} from "@dust-tt/sparkle";
import {
  useVirtuosoLocation,
  useVirtuosoMethods,
} from "@virtuoso.dev/message-list";
import type { MotionProps, Transition } from "framer-motion";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";

const MAX_DISTANCE_FOR_SMOOTH_SCROLL = 2048;
const DOUBLE_ESC_WINDOW_MS = 300;

// Offsets in px
const INPUT_BAR_SWAP_OFFSETS_PX = {
  initial: 8,
  idle: 0,
  exit: -4,
} as const;

// Framer keeps the animated transform in the style attribute once the animation
// settles. A transform other than `none` makes this element a containing block
// for `position: fixed` descendants, so the input bar's fixed dropdown anchor
// would resolve its viewport coordinates against this box instead — misplacing
// it and adding its box to the conversation scroller's scrollable overflow
// (which un-pins the sticky input bar). Collapse the resting identity transform
// back to `none`.
const collapseRestingTransform: MotionProps["transformTemplate"] = (
  { y },
  generated
) => (y ? generated : "none");

const INPUT_BAR_SWAP_TRANSITION = {
  duration: MOTION_DURATIONS.enter,
  ease: MOTION_EASINGS.enter,
  layout: {
    duration: MOTION_DURATIONS.enter,
    ease: MOTION_EASINGS.move,
  },
} satisfies Transition;

const INPUT_BAR_SWAP_EXIT_TRANSITION = {
  duration: MOTION_DURATIONS.exit,
  ease: MOTION_EASINGS.enter,
} satisfies Transition;

interface AgentInputBarProps {
  context: VirtuosoMessageListContext;
}

export const AgentInputBar = ({ context }: AgentInputBarProps) => {
  const [blockedActionIndex, setBlockedActionIndex] = useState<number>(0);
  const [pendingAction, setPendingAction] = useState<
    "stop" | "interrupt" | null
  >(null);
  const pendingActionRef = useRef(pendingAction);
  pendingActionRef.current = pendingAction;
  const generationContext = useGenerationContext();
  const { getBlockedActionItems, hasPendingValidations, startPulsingAction } =
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
  const retryMessage = useRetryMessage({ owner: context.owner });

  const agentBuilderContext = context.agentBuilderContext;

  const isMobile = useIsMobile();
  const shouldReduceMotion = useReducedMotion();
  const accessibleAgentIds = useAccessibleAgentIds({
    workspaceId: context.owner.sId,
  });
  const methods = useVirtuosoMethods<VirtuosoMessage>();
  const { bottomOffset, listOffset, visibleListHeight } = useVirtuosoLocation();
  const {
    effectiveIsCompact,
    expandInputBar,
    onEditorFocusChange,
    onOverlayOpenChange,
    onVoiceActiveChange,
  } = useInputBarCompactMode({
    enabled: isMobile && !agentBuilderContext,
    listOffset,
  });

  const allMessages = methods.data.get();

  const lastUserMessage = allMessages
    .filter(isUserMessage)
    .findLast(
      (m) =>
        !isHandoverUserMessage(m) &&
        m.user?.id === context.user.id &&
        m.visibility !== "deleted"
    );

  const lastRequestedModel = lastUserMessage?.requestedModel ?? null;

  // Last agent mentioned by anyone in the conversation. Computed outside useMemo so the
  // result is a stable object reference (same mention object from the message list) that
  // won't cause unnecessary recomputation of autoMentions when allMessages array ref changes.
  const lastAgentMentionInConversation =
    allMessages
      .filter(isUserMessage)
      .filter((m) => !isHandoverUserMessage(m) && m.visibility !== "deleted")
      .findLast((m) => m.richMentions.some(isRichAgentMention))
      ?.richMentions.find(isRichAgentMention) ?? null;

  const draftAgent = agentBuilderContext?.draftAgent;

  const { contextUsage, contextUsagePercentage } = useConversationContextUsage({
    conversationId: context.conversation?.sId ?? "",
    workspaceId: context.owner.sId,
    options: { disabled: !context.conversation },
  });

  const isCompactionInProgress = allMessages.some(
    (message) => isCompactionMessage(message) && message.status === "created"
  );
  const compactionBlockMessage = isCompactionInProgress
    ? "Wait for compaction to finish."
    : contextUsagePercentage >=
        CONTEXT_USAGE_PERCENT_THRESHOLDS["force_compaction"]
      ? "Context is full, compact to continue."
      : null;
  const forkBlockMessage =
    context.conversation?.forkingData?.forkedFrom?.fileCopyStatus === "pending"
      ? "Wait for the branch to finish preparing."
      : null;
  const showContextUsageBanner =
    contextUsage &&
    !!contextUsagePercentage &&
    contextUsagePercentage >= CONTEXT_USAGE_PERCENT_THRESHOLDS["show_warning"];

  const { activeWakeUp } = useConversationWakeUps({
    owner: context.owner,
    conversationId: context.conversation?.sId ?? "",
    disabled: !context.conversation,
  });

  const isActiveWakeUpOwner = activeWakeUp?.user.sId === context.user.sId;
  const wakeUpBlockMessage =
    activeWakeUp && !isActiveWakeUpOwner
      ? `You cannot send a message to an agent awaiting a wake-up set by another user`
      : null;

  const autoMentions = useMemo(() => {
    // If the user's last message contains only human mentions (no agent),
    // prefill with just those human mentions.
    const mentionsFromLastUserMessage = lastUserMessage?.richMentions ?? [];

    if (
      mentionsFromLastUserMessage.length > 0 &&
      mentionsFromLastUserMessage.every(isRichUserMention)
    ) {
      return mentionsFromLastUserMessage;
    }

    // If we are in the agent builder, we show the draft agent as the sticky mention, all the time.
    // Especially since the draft agent have a new sId every time it is updated.
    if (draftAgent) {
      return [toRichAgentMentionType(draftAgent)];
    }

    // Find the last agent mentioned in the conversation.
    // First from the current user's messages, then from anyone's messages.
    const currentUserAgentMention =
      lastUserMessage?.richMentions.find(isRichAgentMention);
    if (
      currentUserAgentMention &&
      accessibleAgentIds.has(currentUserAgentMention.id)
    ) {
      return [currentUserAgentMention];
    }

    // @sidekick is not available in accessibleAgentIds so we need to skip it
    if (agentBuilderContext) {
      return lastAgentMentionInConversation
        ? [lastAgentMentionInConversation]
        : [];
    }

    if (
      lastAgentMentionInConversation &&
      accessibleAgentIds.has(lastAgentMentionInConversation.id)
    ) {
      return [lastAgentMentionInConversation];
    }

    // For new conversations, the sticky agent (personal default → @dust) is resolved
    // downstream in `useHandleMentions` once the default has loaded, so we intentionally
    // emit no agent mention here. In existing conversations where messages are still
    // loading, don't default either — wait for messages.
    return [];
  }, [
    draftAgent,
    lastUserMessage,
    lastAgentMentionInConversation,
    accessibleAgentIds,
    agentBuilderContext,
  ]);

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
          context.enableAutoScroll();
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
    methods,
    listOffset,
    visibleListHeight,
    bottomOffset,
    context.enableAutoScroll,
  ]);

  const blockedActionItems = getBlockedActionItems(context.user.sId);
  const blockedActions = blockedActionItems.map((item) => item.blockedAction);
  const userAnswerRequiredItem = blockedActionItems.find(
    (item) => item.blockedAction.status === "blocked_user_answer_required"
  );
  const inputBarContentKey =
    userAnswerRequiredItem?.blockedAction.actionId ?? "input-bar";

  // Keep blockedActionIndex in sync when blockedActions array changes.
  useEffect(() => {
    // Clamp index to valid range: [0, length-1] when non-empty, or 0 when empty.
    if (blockedActionIndex >= blockedActions.length) {
      setBlockedActionIndex(Math.max(0, blockedActions.length - 1));
    }
  }, [blockedActionIndex, blockedActions.length]);

  useEffect(() => {
    if (
      pendingAction !== null &&
      !generationContext.generatingMessages.some(
        (m) => m.conversationId === context.conversation?.sId
      )
    ) {
      setPendingAction(null);
    }
  }, [pendingAction, generationContext, context.conversation]);

  const lastEscTimeRef = useRef<number>(0);
  const handleKeyDownRef = useRef<(e: KeyboardEvent) => void>(() => {});

  // Updated on every render so the stable listener below always reads fresh values.
  handleKeyDownRef.current = (e: KeyboardEvent) => {
    if (e.key !== "Escape") {
      return;
    }
    const cId = context.conversation?.sId ?? "";
    const msgs = generationContext.getConversationGeneratingMessages(cId);
    if (msgs.length === 0) {
      return;
    }
    const hasPending =
      (generationContext.pendingSteeringByConversation[cId] ?? 0) > 0;

    const doAction = (action: "cancel" | "interrupt") => {
      if (!context.conversation || pendingActionRef.current !== null) {
        return;
      }
      const pending: "stop" | "interrupt" =
        action === "interrupt" ? "interrupt" : "stop";
      pendingActionRef.current = pending;
      setPendingAction(pending);
      const messageIds = generationContext.generatingMessages
        .filter((m) => m.conversationId === context.conversation?.sId)
        .map((m) => m.messageId);
      generationContext.clearPendingSteeringCount(context.conversation.sId);
      void cancelMessage(messageIds, action).then(() => {
        setPendingAction(null);
        mutateConversation();
      });
    };

    const now = Date.now();
    const timeSinceLastEscMs = now - lastEscTimeRef.current;
    if (timeSinceLastEscMs < DOUBLE_ESC_WINDOW_MS) {
      e.preventDefault();
      lastEscTimeRef.current = 0;
      doAction("cancel");
    } else {
      // Potential single ESC — wait to see if a second ESC follows.
      e.preventDefault();
      lastEscTimeRef.current = now;
      setTimeout(() => {
        if (lastEscTimeRef.current === now && hasPending) {
          doAction("interrupt");
        }
      }, DOUBLE_ESC_WINDOW_MS);
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => handleKeyDownRef.current(e);
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, []);

  if (
    context.isProjectMember === false &&
    context.projectId &&
    context.projectSpaceName
  ) {
    return (
      <div className="relative z-20 mx-auto flex w-full flex-col pt-4 pb-6 md:max-w-[calc(var(--container-conversation)+0.5rem)] md:px-1">
        <PodJoinCTA
          owner={context.owner}
          podId={context.projectId}
          podName={context.projectSpaceName}
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

  const conversationId = context.conversation?.sId ?? "";
  const hasPendingMessages =
    (generationContext.pendingSteeringByConversation[conversationId] ?? 0) > 0;

  const showStopButton = generatingMessages.length > 0;
  const showMessageNavigation = !agentBuilderContext;
  const showNavigationContainer = showStopButton || showMessageNavigation;

  const getStopButtonLabel = () => {
    if (pendingAction === "interrupt") {
      return "Skipping…";
    }
    if (pendingAction === "stop") {
      return "Stopping…";
    }
    if (hasPendingMessages) {
      return "Skip";
    }
    return generatingMessages.length > 1 ? "Stop all" : "Stop";
  };

  const getConversationMessageIds = () =>
    generationContext.generatingMessages
      .filter((m) => m.conversationId === context.conversation?.sId)
      .map((m) => m.messageId);

  const handleAction = async (action: "cancel" | "interrupt") => {
    if (!context.conversation) {
      return;
    }
    setPendingAction(action === "interrupt" ? "interrupt" : "stop");
    generationContext.clearPendingSteeringCount(context.conversation.sId);
    await cancelMessage(getConversationMessageIds(), action);
    setPendingAction(null);
    void mutateConversation();
  };

  const handleStopClick = () => {
    if (hasPendingMessages) {
      void handleAction("interrupt");
    } else {
      void handleAction("cancel");
    }
  };

  const retryUserAnswerRequired = async () => {
    if (!context.conversation || !userAnswerRequiredItem) {
      return;
    }

    const { blockedAction, messageId: outerMessageId } = userAnswerRequiredItem;

    methods.data.map((message) =>
      isAgentMessageWithStreaming(message) && message.sId === outerMessageId
        ? {
            ...message,
            status: "created",
            error: null,
            streaming: {
              ...message.streaming,
              agentState: "acting",
            },
          }
        : message
    );

    const retryBlockedMessage = async ({
      conversationId,
      messageId,
    }: {
      conversationId: string;
      messageId: string;
    }) => {
      const result = await retryMessage({
        conversationId,
        messageId,
        blockedOnly: true,
      });
      if (result.isErr()) {
        context.setLimitReachedCode?.(result.error);
      }
    };

    if (blockedAction.conversationId !== context.conversation.sId) {
      await retryBlockedMessage({
        conversationId: blockedAction.conversationId,
        messageId: blockedAction.messageId,
      });
    }

    await retryBlockedMessage({
      conversationId: context.conversation.sId,
      messageId: outerMessageId,
    });
  };

  const messageNavigationProps = {
    showStopButton,
    showMessageNavigation,
    stopButtonLabel: getStopButtonLabel(),
    hasPendingMessages,
    pendingAction,
    onStopClick: handleStopClick,
    canScrollUp,
    canScrollDown,
    onScrollUp: scrollToPreviousUserMessage,
    onScrollDown: scrollToNextUserMessage,
  };

  if (context.projectId && context.isProjectArchived) {
    return (
      <div className="mx-auto flex w-full flex-col py-4 md:max-w-[calc(var(--container-conversation)+0.5rem)] md:px-1">
        <EmptyCTA
          message="This conversation belongs to an archived Pod. No new messages can be sent."
          action={null}
        />
      </div>
    );
  }

  return (
    <div
      className={classNames(
        // Matches the gutter treatment on the other conversation-column
        // wrappers: constant md:px-1 so the composer shadow never clips,
        // max-w widened by the same 0.5rem to keep the wide-viewport width.
        "relative z-20 mx-auto flex w-full flex-col pt-4 pb-6 md:max-w-[calc(var(--container-conversation)+0.5rem)] md:px-1"
      )}
    >
      <div className="flex w-full justify-center gap-2">
        {showNavigationContainer &&
          (!effectiveIsCompact || !!userAnswerRequiredItem) && (
            <InputBarMessageNavigation
              variant="floating"
              {...messageNavigationProps}
            />
          )}
      </div>
      {blockedActions.length > 0 && !userAnswerRequiredItem && (
        <ContentMessageInline
          icon={InfoCircle}
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
                const { blockedAction, messageId: outerMessageId } =
                  blockedActionItems[blockedActionIndex];

                startPulsingAction(blockedAction.actionId);

                const blockedActionMessageIndex = methods.data.findIndex(
                  (m) =>
                    isAgentMessageWithStreaming(m) && outerMessageId === m.sId
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
      {forkBlockMessage && (
        <ContentMessageInline
          icon={InfoCircle}
          variant="primary"
          className="mb-5 flex max-h-dvh w-full"
        >
          Preparing branch… You can draft a message while its files are copied.
        </ContentMessageInline>
      )}
      {showContextUsageBanner && (
        <ContextUsageWarningBanner
          owner={context.owner}
          conversationId={context.conversation?.sId ?? ""}
          contextUsage={contextUsage}
        />
      )}
      {!showContextUsageBanner && activeWakeUp && context.conversation && (
        <WakeUpBanner
          wakeUp={activeWakeUp}
          owner={context.owner}
          conversationId={context.conversation.sId}
          isOwner={isActiveWakeUpOwner}
        />
      )}
      <div
        className={classNames(
          "relative w-full",
          effectiveIsCompact &&
            !userAnswerRequiredItem &&
            "flex items-center gap-2"
        )}
      >
        <AnimatePresence initial={false} mode="popLayout" anchorY="bottom">
          <motion.div
            key={inputBarContentKey}
            layout={shouldReduceMotion ? undefined : "position"}
            layoutId={
              shouldReduceMotion
                ? undefined
                : `${context.draftKey}-input-bar-content`
            }
            initial={
              shouldReduceMotion
                ? false
                : { opacity: 0, y: INPUT_BAR_SWAP_OFFSETS_PX.initial }
            }
            animate={{
              opacity: 1,
              y: INPUT_BAR_SWAP_OFFSETS_PX.idle,
            }}
            exit={
              shouldReduceMotion
                ? undefined
                : {
                    opacity: 0,
                    y: INPUT_BAR_SWAP_OFFSETS_PX.exit,
                    transition: INPUT_BAR_SWAP_EXIT_TRANSITION,
                  }
            }
            transition={INPUT_BAR_SWAP_TRANSITION}
            transformTemplate={collapseRestingTransform}
            className={classNames(
              "w-full",
              effectiveIsCompact && !userAnswerRequiredItem && "min-w-0 flex-1"
            )}
          >
            {userAnswerRequiredItem?.blockedAction.status ===
            "blocked_user_answer_required" ? (
              <UserAnswerRequired
                blockedAction={userAnswerRequiredItem.blockedAction}
                triggeringUser={
                  userAnswerRequiredItem.blockedAction.userId ===
                  context.user.sId
                    ? context.user
                    : null
                }
                owner={context.owner}
                retryHandler={retryUserAnswerRequired}
              />
            ) : (
              <InputBar
                owner={context.owner}
                user={context.user}
                onSubmit={context.handleSubmit}
                stickyMentions={autoMentions}
                lastRequestedModel={lastRequestedModel}
                conversation={context.conversation}
                draftKey={context.draftKey}
                disableAutoFocus={isMobile}
                disableUserMentions={!!agentBuilderContext}
                disableAgentMentions={
                  agentBuilderContext?.disableAgentMentions === true
                }
                actions={agentBuilderContext?.actionsToShow}
                isSubmitting={agentBuilderContext?.isSubmitting === true}
                isAgentBuilder={!!agentBuilderContext}
                submitBlockMessage={
                  forkBlockMessage ??
                  wakeUpBlockMessage ??
                  compactionBlockMessage
                }
                effectiveIsCompact={effectiveIsCompact}
                onExpandInputBar={expandInputBar}
                onEditorFocusChange={onEditorFocusChange}
                onOverlayOpenChange={onOverlayOpenChange}
                onVoiceActiveChange={onVoiceActiveChange}
              />
            )}
          </motion.div>
        </AnimatePresence>
        {effectiveIsCompact &&
          !userAnswerRequiredItem &&
          showNavigationContainer && (
            <div className="shrink-0">
              <div className={INPUT_BAR_COMPACT_NAV_ENTER_ANIMATION_CLASSES}>
                <InputBarMessageNavigation
                  variant="compact"
                  {...messageNavigationProps}
                />
              </div>
            </div>
          )}
      </div>
    </div>
  );
};
