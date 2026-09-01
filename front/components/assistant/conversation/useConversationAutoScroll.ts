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

  // Virtuoso's public onScroll fires before its row-height compensation, so a
  // native listener restores the detached position after Virtuoso updates it.
  useEffect(() => {
    const methods = messageListRef.current;
    const scrollElement = isMobile
      ? document.scrollingElement
      : methods?.scrollerElement();
    if (!methods || !(scrollElement instanceof HTMLElement)) {
      return;
    }

    const scrollTarget = isMobile ? window : scrollElement;
    const listElement = methods.scrollerElement()?.firstElementChild;
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

    const resizeObserver = new ResizeObserver(() => {
      // Advance the height baseline when content grows without scrolling.
      if (
        !isAutoScrollEnabledRef.current &&
        scrollElement.scrollTop === previousScrollTop
      ) {
        previousScrollHeight = scrollElement.scrollHeight;
      }
    });
    if (listElement) {
      resizeObserver.observe(listElement);
    }

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

      // The sticky input bar hides the last part of the viewport. Reattach as
      // soon as the user scrolls back down into that area, rather than making
      // them catch a moving 4px target while the answer keeps growing.
      if (
        !isAutoScrollEnabledRef.current &&
        scrollTopDelta > 0 &&
        !isHeightCompensation &&
        isNearBottom
      ) {
        enableAutoScroll();
        methods.scrollToItem({
          index: "LAST",
          align: "end",
          behavior: "instant",
        });
      }

      if (!isAutoScrollEnabledRef.current && isHeightCompensation) {
        scrollElement.scrollTop = previousScrollTop;
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
      resizeObserver.disconnect();
      scrollTarget.removeEventListener("scroll", onScroll);
      scrollElement.removeEventListener("touchstart", onTouchStart);
      scrollElement.removeEventListener("touchmove", onTouchMove);
    };
  }, [enableAutoScroll, isMobile, messageListRef]);

  return { enableAutoScroll, isAutoScrollEnabledRef };
}
