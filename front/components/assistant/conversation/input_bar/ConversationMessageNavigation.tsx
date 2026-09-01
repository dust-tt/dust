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
import { useCallback, useRef } from "react";

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
 * useVirtuosoLocation re-renders its host on every scroll frame, so the
 * subscription lives here rather than in AgentInputBar: a scroll frame costs
 * this component's body instead of the whole composer and its Framer Motion
 * layout animation.
 *
 * Everything below is shaped around running on each of those frames — the
 * message list is walked once without allocating, and the two targets are held
 * in refs so the arrows keep stable props and React bails out of re-rendering
 * them while the answers do not change.
 */
export function ConversationMessageNavigation({
  variant,
  ...navigationProps
}: ConversationMessageNavigationProps) {
  const methods = useVirtuosoMethods<VirtuosoMessage>();
  const { bottomOffset, listOffset, visibleListHeight } = useVirtuosoLocation();

  const targetsRef = useRef({
    lastFullyAboveIndex: -1,
    firstBelowTopQuarterIndex: -1,
    bottomOffset: 0,
  });

  const allMessages = methods.data.get();

  // Convert listOffset to positive scroll position.
  // listOffset is negative when scrolled down (distance from list top to viewport top).
  const viewportTop = -listOffset;
  const viewportTopQuarter = viewportTop + visibleListHeight / 4;

  // Single pass, no intermediate arrays: message tops and bottoms both increase
  // with the index, so the last user message above the viewport and the first
  // one below its top quarter are all the arrows need.
  let accumulatedHeight = 0;
  let lastFullyAboveIndex = -1;
  let firstBelowTopQuarterIndex = -1;
  for (let i = 0; i < allMessages.length; i++) {
    const msg = allMessages[i];
    const top = accumulatedHeight;
    accumulatedHeight += methods.height(msg);
    const bottom = accumulatedHeight;

    if (!isUserMessage(msg) || isHiddenMessage(msg)) {
      continue;
    }
    if (bottom <= viewportTop) {
      lastFullyAboveIndex = i;
    }
    if (firstBelowTopQuarterIndex === -1 && top >= viewportTopQuarter) {
      firstBelowTopQuarterIndex = i;
    }
  }

  targetsRef.current = {
    lastFullyAboveIndex,
    firstBelowTopQuarterIndex,
    bottomOffset,
  };

  const canScrollUp = lastFullyAboveIndex !== -1;
  const canScrollDown =
    (firstBelowTopQuarterIndex !== -1 || bottomOffset > 0) &&
    !methods.getScrollLocation().isAtBottom;

  const scrollToPreviousUserMessage = useCallback(() => {
    // Scroll to the last user message that's fully above (closest to current view).
    const { lastFullyAboveIndex: targetIndex } = targetsRef.current;
    if (targetIndex !== -1) {
      methods.scrollToItem({
        index: targetIndex,
        align: "start",
        behavior: "smooth",
      });
    }
  }, [methods]);

  const scrollToNextUserMessage = useCallback(() => {
    const { firstBelowTopQuarterIndex: targetIndex, bottomOffset: offset } =
      targetsRef.current;
    if (targetIndex !== -1) {
      // Scroll to the first user message below top quarter.
      methods.scrollToItem({
        index: targetIndex,
        align: "start",
        behavior: "smooth",
      });
    } else if (offset > 0) {
      // No more user messages below, but there's content - scroll to bottom.
      methods.scrollToItem({
        index: "LAST",
        align: "end",
        behavior:
          offset < MAX_DISTANCE_FOR_SMOOTH_SCROLL ? "smooth" : "instant",
      });
    }
  }, [methods]);

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
