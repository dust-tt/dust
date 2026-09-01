import { InputBarMessageNavigation } from "@app/components/assistant/conversation/input_bar/InputBarMessageNavigation";
import type { VirtuosoMessage } from "@app/components/assistant/conversation/types";
import {
  isHiddenMessage,
  isUserMessage,
} from "@app/components/assistant/conversation/types";
import {
  useVirtuosoLocation,
  useVirtuosoMethods,
} from "@virtuoso.dev/message-list";
import { useMemo } from "react";

const MAX_DISTANCE_FOR_SMOOTH_SCROLL = 2048;

interface ConversationMessageNavigationProps {
  variant: "floating" | "compact";
  showStopButton: boolean;
  showMessageNavigation: boolean;
  stopButtonLabel: string;
  hasPendingMessages: boolean;
  pendingAction: "stop" | "interrupt" | null;
  onStopClick: () => void;
}

/**
 * Resolves the previous/next user message from the current scroll position and
 * renders the navigation arrows.
 *
 * useVirtuosoLocation re-renders its host on every scroll frame, and resolving
 * the targets walks the whole message list. Both live here rather than in
 * AgentInputBar so a scroll frame costs this small subtree instead of the whole
 * composer and its Framer Motion layout animation.
 */
export function ConversationMessageNavigation({
  variant,
  ...navigationProps
}: ConversationMessageNavigationProps) {
  const methods = useVirtuosoMethods<VirtuosoMessage>();
  const { bottomOffset, listOffset, visibleListHeight } = useVirtuosoLocation();

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

  return (
    <InputBarMessageNavigation
      variant={variant}
      {...navigationProps}
      canScrollUp={canScrollUp}
      canScrollDown={canScrollDown}
      onScrollUp={scrollToPreviousUserMessage}
      onScrollDown={scrollToNextUserMessage}
    />
  );
}
