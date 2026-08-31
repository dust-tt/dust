import type {
  VirtuosoMessage,
  VirtuosoMessageListContext,
} from "@app/components/assistant/conversation/types";
import type {
  ListScrollLocation,
  VirtuosoMessageListMethods,
} from "@virtuoso.dev/message-list";
import type { RefObject } from "react";
import { useCallback, useEffect, useRef } from "react";

interface UseConversationAutoScrollProps {
  isMobile: boolean;
  messageListRef: RefObject<VirtuosoMessageListMethods<
    VirtuosoMessage,
    VirtuosoMessageListContext
  > | null>;
}

export function useConversationAutoScroll({
  isMobile,
  messageListRef,
}: UseConversationAutoScrollProps) {
  const isAutoScrollEnabledRef = useRef(true);
  const hasLeftBottomSinceDetachRef = useRef(false);

  const enableAutoScroll = useCallback(() => {
    isAutoScrollEnabledRef.current = true;
    hasLeftBottomSinceDetachRef.current = false;
  }, []);

  const handleScroll = useCallback(
    (location: Pick<ListScrollLocation, "isAtBottom">) => {
      if (isAutoScrollEnabledRef.current) {
        return;
      }

      if (!location.isAtBottom) {
        hasLeftBottomSinceDetachRef.current = true;
      } else if (hasLeftBottomSinceDetachRef.current) {
        enableAutoScroll();
      }
    },
    [enableAutoScroll]
  );

  // While the list's scroll direction is "up", Virtuoso compensates row-height
  // growth by adding the same delta to scrollTop. Streaming markdown can keep
  // that compensation alive indefinitely. A native listener recognizes those
  // matching deltas and restores the detached position before the next paint.
  useEffect(() => {
    const scrollElement = isMobile
      ? document.scrollingElement
      : messageListRef.current?.scrollerElement();
    if (!(scrollElement instanceof HTMLElement)) {
      return;
    }

    const scrollTarget = isMobile ? window : scrollElement;
    const listElement =
      messageListRef.current?.scrollerElement()?.firstElementChild;
    let previousScrollHeight = scrollElement.scrollHeight;
    let previousScrollTop = scrollElement.scrollTop;
    let lastTouchY: number | null = null;

    const captureScrollPosition = () => {
      previousScrollHeight = scrollElement.scrollHeight;
      previousScrollTop = scrollElement.scrollTop;
    };

    const detachFromAutoScroll = () => {
      captureScrollPosition();
      if (!isAutoScrollEnabledRef.current) {
        return;
      }

      isAutoScrollEnabledRef.current = false;
      hasLeftBottomSinceDetachRef.current = false;
      messageListRef.current?.cancelSmoothScroll();
    };

    const resizeObserver = new ResizeObserver(() => {
      // Keep the height baseline current when the list grows without moving.
      // If scrollTop changed, the scroll listener still needs the old values
      // to recognize and undo Virtuoso's height compensation.
      if (
        !isAutoScrollEnabledRef.current &&
        scrollElement.scrollTop === previousScrollTop
      ) {
        captureScrollPosition();
      }
    });
    if (listElement) {
      resizeObserver.observe(listElement);
    }

    const preserveDetachedScrollPosition = () => {
      const scrollHeight = scrollElement.scrollHeight;
      let scrollTop = scrollElement.scrollTop;
      const scrollHeightDelta = scrollHeight - previousScrollHeight;
      const scrollTopDelta = scrollTop - previousScrollTop;
      const isHeightCompensation =
        scrollHeightDelta !== 0 &&
        Math.abs(scrollTopDelta - scrollHeightDelta) <= 1;

      if (
        isAutoScrollEnabledRef.current &&
        scrollTopDelta < 0 &&
        !isHeightCompensation &&
        messageListRef.current?.getScrollLocation().isAtBottom === false
      ) {
        isAutoScrollEnabledRef.current = false;
        hasLeftBottomSinceDetachRef.current = true;
        messageListRef.current?.cancelSmoothScroll();
      }

      if (!isAutoScrollEnabledRef.current && isHeightCompensation) {
        scrollElement.scrollTop -= scrollTopDelta;
        scrollTop = scrollElement.scrollTop;
      }

      previousScrollHeight = scrollHeight;
      previousScrollTop = scrollTop;
    };

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) {
        return;
      }

      if (event.deltaY < 0) {
        detachFromAutoScroll();
      } else if (!isAutoScrollEnabledRef.current) {
        captureScrollPosition();
      }
    };

    const onTouchStart = (event: TouchEvent) => {
      lastTouchY = event.touches[0]?.clientY ?? null;
    };

    const onTouchMove = (event: TouchEvent) => {
      const touchY = event.touches[0]?.clientY;
      if (touchY === undefined) {
        return;
      }

      if (lastTouchY !== null && touchY > lastTouchY) {
        detachFromAutoScroll();
      } else if (!isAutoScrollEnabledRef.current) {
        captureScrollPosition();
      }
      lastTouchY = touchY;
    };

    scrollTarget.addEventListener("scroll", preserveDetachedScrollPosition, {
      passive: true,
    });
    scrollElement.addEventListener("wheel", onWheel, { passive: true });
    scrollElement.addEventListener("touchstart", onTouchStart, {
      passive: true,
    });
    scrollElement.addEventListener("touchmove", onTouchMove, { passive: true });
    return () => {
      resizeObserver.disconnect();
      scrollTarget.removeEventListener(
        "scroll",
        preserveDetachedScrollPosition
      );
      scrollElement.removeEventListener("wheel", onWheel);
      scrollElement.removeEventListener("touchstart", onTouchStart);
      scrollElement.removeEventListener("touchmove", onTouchMove);
    };
  }, [isMobile, messageListRef]);

  return { enableAutoScroll, handleScroll, isAutoScrollEnabledRef };
}
