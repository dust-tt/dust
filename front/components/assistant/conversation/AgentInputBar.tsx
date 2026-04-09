import { useBlockedActionsContext } from "@app/components/assistant/conversation/BlockedActionsProvider";
import { useGenerationContext } from "@app/components/assistant/conversation/GenerationContextProvider";
import { InputBar } from "@app/components/assistant/conversation/input_bar/InputBar";
import type {
  VirtuosoMessage,
  VirtuosoMessageListContext,
} from "@app/components/assistant/conversation/types";
import {
  isAgentMessageWithStreaming,
  isHandoverUserMessage,
  isHiddenMessage,
  isUserMessage,
} from "@app/components/assistant/conversation/types";
import { ProjectJoinCTA } from "@app/components/spaces/ProjectJoinCTA";
import { useCancelMessage, useConversation } from "@app/hooks/conversations";
import { useFeatureFlags } from "@app/lib/auth/AuthContext";
import { useUnifiedAgentConfigurations } from "@app/lib/swr/assistants";
import { useIsMobile } from "@app/lib/swr/useIsMobile";
import { GLOBAL_AGENTS_SID } from "@app/types/assistant/assistant";
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
} from "@dust-tt/sparkle";
import {
  useVirtuosoLocation,
  useVirtuosoMethods,
} from "@virtuoso.dev/message-list";
import { useEffect, useMemo, useState } from "react";

const MAX_DISTANCE_FOR_SMOOTH_SCROLL = 2048;

export const AgentInputBar = ({
  context,
}: {
  context: VirtuosoMessageListContext;
}) => {
  const [blockedActionIndex, setBlockedActionIndex] = useState<number>(0);
  const [isStopping, setIsStopping] = useState<boolean>(false);
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

  const isMobile = useIsMobile();
  const { hasFeature } = useFeatureFlags();
  const singleAgentInput = hasFeature("enable_steering");
  const { agentConfigurations } = useUnifiedAgentConfigurations({
    workspaceId: context.owner.sId,
  });
  const accessibleAgentIds = useMemo(
    () => new Set(agentConfigurations.map((a) => a.sId)),
    [agentConfigurations]
  );
  const methods = useVirtuosoMethods<VirtuosoMessage>();
  const { bottomOffset, listOffset, visibleListHeight } = useVirtuosoLocation();

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
  const lastAgentMentionInConversation = singleAgentInput
    ? (allMessages
        .filter(isUserMessage)
        .filter((m) => !isHandoverUserMessage(m) && m.visibility !== "deleted")
        .findLast((m) => m.richMentions.some(isRichAgentMention))
        ?.richMentions.find(isRichAgentMention) ?? null)
    : null;

  const draftAgent = context.agentBuilderContext?.draftAgent;

  const autoMentions = useMemo(() => {
    // If we are in the agent builder, we show the draft agent as the sticky mention, all the time.
    // Especially since the draft agent have a new sId every time it is updated.
    if (draftAgent) {
      return [toRichAgentMentionType(draftAgent)];
    }

    // In single-agent mode, find the last agent mentioned in the conversation.
    // First from the current user's messages, then from anyone's messages.
    if (singleAgentInput) {
      const currentUserAgentMention =
        lastUserMessage?.richMentions.find(isRichAgentMention);
      if (
        currentUserAgentMention &&
        accessibleAgentIds.has(currentUserAgentMention.id)
      ) {
        return [currentUserAgentMention];
      }

      // @sidekick is not available in accessibleAgentIds so we need to skip it
      if (context.agentBuilderContext) {
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

      // Ultimate fallback: select the "dust" agent if available.
      const dustAgent = agentConfigurations.find(
        (a) => a.sId === GLOBAL_AGENTS_SID.DUST
      );
      if (dustAgent) {
        return [toRichAgentMentionType(dustAgent)];
      }

      return [];
    }

    // Non-steering mode: prefill all mentions if they are all agent mentions.
    const shouldPrefill =
      lastUserMessage &&
      lastUserMessage.richMentions.length > 0 &&
      lastUserMessage.richMentions.every(isRichAgentMention);

    if (shouldPrefill) {
      return lastUserMessage.richMentions;
    }

    return [];
  }, [
    draftAgent,
    lastUserMessage,
    singleAgentInput,
    lastAgentMentionInConversation,
    accessibleAgentIds,
    agentConfigurations,
    context.agentBuilderContext,
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
      <div className="relative z-20 mx-auto flex max-h-dvh w-full flex-col py-4 sm:w-full sm:max-w-conversation">
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
        "relative z-20 mx-auto flex max-h-dvh w-full flex-col py-4 sm:w-full sm:max-w-conversation"
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
      <InputBar
        owner={context.owner}
        user={context.user}
        onSubmit={context.handleSubmit}
        stickyMentions={autoMentions}
        conversation={context.conversation}
        draftKey={context.draftKey}
        disableAutoFocus={isMobile}
        disableUserMentions={!!context.agentBuilderContext}
        actions={context.agentBuilderContext?.actionsToShow}
        isSubmitting={context.agentBuilderContext?.isSubmitting === true}
        isAgentBuilder={!!context.agentBuilderContext}
      />
    </div>
  );
};
