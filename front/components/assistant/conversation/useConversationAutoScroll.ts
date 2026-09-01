import type {
  VirtuosoMessage,
  VirtuosoMessageListContext,
} from "@app/components/assistant/conversation/types";
import type { VirtuosoMessageListMethods } from "@virtuoso.dev/message-list";
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
  const enableAutoScroll = useCallback(() => {
    isAutoScrollEnabledRef.current = true;
  }, []);

  // Compare native scroll movement with list height changes so Virtuoso's row
  // remeasurement is not mistaken for user scroll intent.
  useEffect(() => {
    const methods = messageListRef.current;
    const scrollElement = isMobile
      ? document.scrollingElement
      : methods?.scrollerElement();
    if (!methods || !(scrollElement instanceof HTMLElement)) {
      return;
    }

    const scrollTarget = isMobile ? window : scrollElement;
    let previousScrollHeight = scrollElement.scrollHeight;
    let previousScrollTop = scrollElement.scrollTop;
    let lastTouchY: number | null = null;

    const captureScrollPosition = () => {
      previousScrollHeight = scrollElement.scrollHeight;
      previousScrollTop = scrollElement.scrollTop;
    };

    const detachFromAutoScroll = () => {
      captureScrollPosition();
      if (isAutoScrollEnabledRef.current) {
        isAutoScrollEnabledRef.current = false;
        methods.cancelSmoothScroll();
      }
    };

    const onScroll = () => {
      const scrollHeight = scrollElement.scrollHeight;
      const scrollTop = scrollElement.scrollTop;
      const scrollHeightDelta = scrollHeight - previousScrollHeight;
      const scrollTopDelta = scrollTop - previousScrollTop;
      const isHeightCompensation =
        scrollHeightDelta !== 0 &&
        Math.abs(scrollTopDelta - scrollHeightDelta) <= 1;
      const location = methods.getScrollLocation();

      if (
        isAutoScrollEnabledRef.current &&
        scrollTopDelta < 0 &&
        !isHeightCompensation &&
        !location.isAtBottom
      ) {
        detachFromAutoScroll();
      }

      const viewportHeight = isMobile
        ? window.innerHeight
        : scrollElement.clientHeight;
      const stickyFooterHeight = Math.max(
        0,
        viewportHeight - location.visibleListHeight
      );
      const isNearBottom =
        location.isAtBottom || location.bottomOffset <= stickyFooterHeight;

      // The sticky input bar hides the last part of the viewport. Reattach on
      // downward user movement into that area, but ignore list height changes.
      if (
        !isAutoScrollEnabledRef.current &&
        scrollTopDelta > 0 &&
        scrollHeightDelta === 0 &&
        isNearBottom
      ) {
        enableAutoScroll();
        methods.scrollToItem({
          index: "LAST",
          align: "end",
          behavior: "instant",
        });
      }

      previousScrollHeight = scrollHeight;
      previousScrollTop = scrollElement.scrollTop;
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

    const passiveOptions = { passive: true };
    scrollTarget.addEventListener("scroll", onScroll, passiveOptions);
    scrollElement.addEventListener("touchstart", onTouchStart, passiveOptions);
    scrollElement.addEventListener("touchmove", onTouchMove, passiveOptions);
    return () => {
      scrollTarget.removeEventListener("scroll", onScroll);
      scrollElement.removeEventListener("touchstart", onTouchStart);
      scrollElement.removeEventListener("touchmove", onTouchMove);
    };
  }, [enableAutoScroll, isMobile, messageListRef]);

  return { enableAutoScroll, isAutoScrollEnabledRef };
}
