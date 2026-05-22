import { useBlockedActionsContext } from "@app/components/assistant/conversation/BlockedActionsProvider";
import { ContextUsageWarningBanner } from "@app/components/assistant/conversation/ContextUsageWarningBanner";
import { useGenerationContext } from "@app/components/assistant/conversation/GenerationContextProvider";
import { InputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
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
import { WakeUpBanner } from "@app/components/assistant/conversation/WakeUpBanner";
import { ProjectJoinCTA } from "@app/components/spaces/ProjectJoinCTA";
import {
  useCancelMessage,
  useConversation,
  useConversationContextUsage,
} from "@app/hooks/conversations";
import { CONTEXT_USAGE_PERCENT_THRESHOLDS } from "@app/hooks/conversations/useConversationContextUsage";
import { useUnifiedAgentConfigurations } from "@app/lib/swr/assistants";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { useConversationWakeUps } from "@app/lib/swr/wakeups";
import { classNames } from "@app/lib/utils";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
import {
  isRichAgentMention,
  isRichUserMention,
  toRichAgentMentionType,
} from "@app/types/assistant/mentions";
import { pluralize } from "@app/types/shared/utils/string_utils";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  BoltIcon,
  Button,
  ContentMessageAction,
  ContentMessageInline,
  EmptyCTA,
  IconButton,
  InformationCircleIcon,
  StopIcon,
} from "@dust-tt/sparkle";
import {
  useVirtuosoLocation,
  useVirtuosoMethods,
} from "@virtuoso.dev/message-list";
import { useEffect, useMemo, useRef, useState } from "react";

const MAX_DISTANCE_FOR_SMOOTH_SCROLL = 2048;
const DOUBLE_ESC_WINDOW_MS = 300;

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

  const agentBuilderContext = context.agentBuilderContext;

  const isMobile = useIsMobile();
  const { agentConfigurations } = useUnifiedAgentConfigurations({
    workspaceId: context.owner.sId,
  });
  const accessibleAgentIds = useMemo(
    () => new Set(agentConfigurations.map((a) => a.sId)),
    [agentConfigurations]
  );
  const methods = useVirtuosoMethods<VirtuosoMessage>();
  const { bottomOffset, listOffset, visibleListHeight } = useVirtuosoLocation();
  const [isInputBarExpanded, setIsInputBarExpanded] = useState(true);
  const prevListOffsetRef = useRef<number | null>(null);

  useEffect(() => {
    if (prevListOffsetRef.current === null) {
      prevListOffsetRef.current = listOffset;
      return;
    }

    if (listOffset !== prevListOffsetRef.current) {
      prevListOffsetRef.current = listOffset;
      setIsInputBarExpanded(false);
    }
  }, [listOffset]);

  const isInputBarCompact =
    isMobile && !agentBuilderContext && !isInputBarExpanded;

  const allMessages = methods.data.get();

  const lastUserMessage = allMessages
    .filter(isUserMessage)
    .findLast(
      (m) =>
        !isHandoverUserMessage(m) &&
        m.user?.id === context.user.id &&
        m.visibility !== "deleted"
    );

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

    // Fall back to @dust only for new conversations. In existing conversations
    // where messages are still loading, don't default — wait for messages.
    if (!context.conversation) {
      const dustAgent = agentConfigurations.find(
        (a) => a.sId === GLOBAL_AGENTS_SID.DUST
      );
      if (dustAgent) {
        return [toRichAgentMentionType(dustAgent)];
      }
    }

    return [];
  }, [
    context.conversation,
    draftAgent,
    lastUserMessage,
    lastAgentMentionInConversation,
    accessibleAgentIds,
    agentConfigurations,
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
  const hasUserAnswerRequired = blockedActions.some(
    (action) => action.status === "blocked_user_answer_required"
  );

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
        if (lastEscTimeRef.current === now) {
          doAction(hasPending ? "interrupt" : "cancel");
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
      <div className="relative z-20 mx-auto flex max-h-dvh w-full flex-col py-4 sm:w-full sm:max-w-conversation">
        <ProjectJoinCTA
          owner={context.owner}
          spaceId={context.projectId}
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

  if (context.projectId && context.isProjectArchived) {
    return (
      <div className="mx-auto flex flex-col w-full py-4 sm:max-w-conversation">
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
        "relative z-20 mx-auto flex max-h-dvh w-full flex-col py-4 sm:w-full sm:max-w-conversation"
      )}
    >
      <div className="flex w-full justify-center gap-2">
        {showNavigationContainer && (
          <div
            className="flex items-center gap-1 rounded-xl border border-border bg-white p-1 dark:border-border-night dark:bg-muted-night"
            style={{
              position: "absolute",
              top: "-2rem",
            }}
          >
            {showStopButton && (
              <>
                <Button
                  variant="ghost"
                  label={getStopButtonLabel()}
                  icon={hasPendingMessages ? BoltIcon : StopIcon}
                  onClick={
                    hasPendingMessages
                      ? () => handleAction("interrupt")
                      : () => handleAction("cancel")
                  }
                  disabled={pendingAction !== null}
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
                    isAgentMessageWithStreaming(m) &&
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
      <InputBar
        owner={context.owner}
        user={context.user}
        onSubmit={context.handleSubmit}
        stickyMentions={autoMentions}
        conversation={context.conversation}
        draftKey={context.draftKey}
        disableAutoFocus={isMobile || hasUserAnswerRequired}
        disableUserMentions={!!agentBuilderContext}
        actions={agentBuilderContext?.actionsToShow}
        isSubmitting={agentBuilderContext?.isSubmitting === true}
        isAgentBuilder={!!agentBuilderContext}
        submitBlockMessage={wakeUpBlockMessage ?? compactionBlockMessage}
        isCompact={isInputBarCompact}
        onExpandInputBar={() => setIsInputBarExpanded(true)}
      />
    </div>
  );
};
