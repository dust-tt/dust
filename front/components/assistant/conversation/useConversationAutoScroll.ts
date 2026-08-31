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
  const hasLeftBottomRef = useRef(false);

  const enableAutoScroll = useCallback(() => {
    isAutoScrollEnabledRef.current = true;
    hasLeftBottomRef.current = false;
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
        hasLeftBottomRef.current = false;
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
      const isAtBottom = methods.getScrollLocation().isAtBottom;

      if (
        isAutoScrollEnabledRef.current &&
        scrollTopDelta < 0 &&
        !isHeightCompensation &&
        !isAtBottom
      ) {
        detachFromAutoScroll();
        hasLeftBottomRef.current = true;
      }

      // Reattach before correcting concurrent height compensation. Otherwise
      // the correction can move the viewport away from the bottom again.
      if (!isAutoScrollEnabledRef.current) {
        if (!isAtBottom) {
          hasLeftBottomRef.current = true;
        } else if (hasLeftBottomRef.current) {
          enableAutoScroll();
        }
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
