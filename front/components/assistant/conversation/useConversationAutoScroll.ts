import type {
  UserScrollActivity,
  VirtuosoMessage,
  VirtuosoMessageListContext,
} from "@app/components/assistant/conversation/types";
import type { VirtuosoMessageListMethods } from "@virtuoso.dev/message-list";
import type { RefObject } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";

type ConversationAutoScrollMethods = Pick<
  VirtuosoMessageListMethods<VirtuosoMessage, VirtuosoMessageListContext>,
  | "cancelSmoothScroll"
  | "getScrollLocation"
  | "scrollerElement"
  | "scrollToItem"
>;

type UserScrollDirection = "up" | "down";

interface UseConversationAutoScrollProps {
  isMobile: boolean;
  messageListRef: RefObject<ConversationAutoScrollMethods | null>;
}

export function useConversationAutoScroll({
  isMobile,
  messageListRef,
}: UseConversationAutoScrollProps) {
  const isAutoScrollEnabledRef = useRef(true);
  const isUserScrollingRef = useRef(false);
  const userScrollEndListenersRef = useRef(new Set<() => void>());
  // A gesture can produce several scroll events. Keep its direction until the
  // gesture ends so concurrent stream movement cannot reverse its meaning.
  const userScrollDirectionRef = useRef<UserScrollDirection | null>(null);

  const finishUserScroll = useCallback(() => {
    if (!isUserScrollingRef.current) {
      return;
    }

    isUserScrollingRef.current = false;
    userScrollDirectionRef.current = null;
    for (const listener of userScrollEndListenersRef.current) {
      listener();
    }
  }, []);

  const userScrollActivity = useMemo<UserScrollActivity>(
    () => ({
      isActive: () => isUserScrollingRef.current,
      subscribeToEnd: (listener) => {
        userScrollEndListenersRef.current.add(listener);
        return () => {
          userScrollEndListenersRef.current.delete(listener);
        };
      },
    }),
    []
  );

  const enableAutoScroll = useCallback(() => {
    isAutoScrollEnabledRef.current = true;
    userScrollDirectionRef.current = null;
  }, []);

  // Track gestures separately from their resulting scroll movement so
  // Virtuoso's concurrent movement cannot hide the user's direction.
  useEffect(() => {
    const methods = messageListRef.current;
    const scrollElement = isMobile
      ? document.scrollingElement
      : methods?.scrollerElement();
    if (!methods || !(scrollElement instanceof HTMLElement)) {
      return;
    }

    const scrollTarget = isMobile ? window : scrollElement;
    const scrollEndTarget = isMobile ? document : scrollElement;
    const supportsNativeScrollEnd =
      "onscrollend" in scrollEndTarget &&
      scrollEndTarget.onscrollend !== undefined;
    let previousScrollHeight = scrollElement.scrollHeight;
    let previousScrollTop = scrollElement.scrollTop;
    let lastTouchY: number | null = null;
    let isTouchActive = false;
    let scrollEventVersion = 0;
    let touchStartScrollEventVersion = 0;
    let fallbackAnimationFrame: number | null = null;

    const startUserScroll = () => {
      isUserScrollingRef.current = true;
    };

    const cancelScrollEndFallback = () => {
      if (fallbackAnimationFrame !== null) {
        window.cancelAnimationFrame(fallbackAnimationFrame);
        fallbackAnimationFrame = null;
      }
    };

    // Older Safari does not expose scrollend, and browsers do not emit it when
    // a gesture causes no movement. Cover both cases without a time delay by
    // waiting for pointer release and a stable scroll position.
    const observeScrollEndFallback = () => {
      if (isTouchActive || fallbackAnimationFrame !== null) {
        return;
      }

      const initialScrollEventVersion = scrollEventVersion;
      let previousObservedScrollTop = scrollElement.scrollTop;
      let stableFrameCount = 0;
      const observeScrollPosition = () => {
        if (!isUserScrollingRef.current) {
          fallbackAnimationFrame = null;
          return;
        }

        if (
          supportsNativeScrollEnd &&
          scrollEventVersion !== initialScrollEventVersion
        ) {
          fallbackAnimationFrame = null;
          return;
        }

        const scrollTop = scrollElement.scrollTop;
        if (scrollTop === previousObservedScrollTop) {
          stableFrameCount += 1;
        } else {
          stableFrameCount = 0;
        }
        previousObservedScrollTop = scrollTop;

        if (stableFrameCount >= 2) {
          fallbackAnimationFrame = null;
          finishUserScroll();
          return;
        }

        fallbackAnimationFrame = window.requestAnimationFrame(
          observeScrollPosition
        );
      };

      fallbackAnimationFrame = window.requestAnimationFrame(
        observeScrollPosition
      );
    };

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
      scrollEventVersion += 1;
      const scrollHeight = scrollElement.scrollHeight;
      const scrollTop = scrollElement.scrollTop;
      const scrollHeightDelta = scrollHeight - previousScrollHeight;
      const scrollTopDelta = scrollTop - previousScrollTop;
      const isHeightCompensation =
        scrollHeightDelta !== 0 &&
        Math.abs(scrollTopDelta - scrollHeightDelta) <= 1;
      const location = methods.getScrollLocation();

      if (userScrollDirectionRef.current !== null) {
        startUserScroll();
        if (!supportsNativeScrollEnd) {
          observeScrollEndFallback();
        }
      }

      if (
        isAutoScrollEnabledRef.current &&
        scrollTopDelta < 0 &&
        !isHeightCompensation &&
        !location.isAtBottom
      ) {
        userScrollDirectionRef.current = "up";
        startUserScroll();
        if (!supportsNativeScrollEnd) {
          observeScrollEndFallback();
        }
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
      const isUserScrollingDown =
        userScrollDirectionRef.current === "down" ||
        (userScrollDirectionRef.current === null &&
          scrollTopDelta > 0 &&
          scrollHeightDelta === 0);

      // The sticky input bar hides the last part of the viewport. Reattach on
      // downward user movement into that area. Gesture direction takes
      // precedence over deltas that may also include list height changes.
      if (
        !isAutoScrollEnabledRef.current &&
        isUserScrollingDown &&
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

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.deltaY === 0) {
        return;
      }

      userScrollDirectionRef.current = event.deltaY < 0 ? "up" : "down";
      startUserScroll();
      observeScrollEndFallback();
      if (userScrollDirectionRef.current === "up") {
        detachFromAutoScroll();
      }
    };

    const onTouchStart = (event: TouchEvent) => {
      isTouchActive = true;
      touchStartScrollEventVersion = scrollEventVersion;
      lastTouchY = event.touches[0]?.clientY ?? null;
    };

    const onTouchMove = (event: TouchEvent) => {
      const touchY = event.touches[0]?.clientY;
      if (touchY === undefined) {
        return;
      }

      if (lastTouchY !== null && touchY !== lastTouchY) {
        userScrollDirectionRef.current = touchY > lastTouchY ? "up" : "down";
        startUserScroll();
        if (userScrollDirectionRef.current === "up") {
          detachFromAutoScroll();
        }
      }
      lastTouchY = touchY;
    };

    const onTouchEnd = () => {
      isTouchActive = false;
      lastTouchY = null;
      if (!isUserScrollingRef.current) {
        return;
      }
      if (
        supportsNativeScrollEnd &&
        scrollEventVersion !== touchStartScrollEventVersion
      ) {
        return;
      }
      observeScrollEndFallback();
    };

    const onScrollEnd = () => {
      cancelScrollEndFallback();
      finishUserScroll();
    };

    const passiveOptions = { passive: true };
    scrollTarget.addEventListener("scroll", onScroll, passiveOptions);
    scrollEndTarget.addEventListener("scrollend", onScrollEnd, passiveOptions);
    scrollElement.addEventListener("wheel", onWheel, passiveOptions);
    scrollElement.addEventListener("touchstart", onTouchStart, passiveOptions);
    scrollElement.addEventListener("touchmove", onTouchMove, passiveOptions);
    scrollElement.addEventListener("touchend", onTouchEnd, passiveOptions);
    scrollElement.addEventListener("touchcancel", onTouchEnd, passiveOptions);
    return () => {
      cancelScrollEndFallback();
      scrollTarget.removeEventListener("scroll", onScroll);
      scrollEndTarget.removeEventListener("scrollend", onScrollEnd);
      scrollElement.removeEventListener("wheel", onWheel);
      scrollElement.removeEventListener("touchstart", onTouchStart);
      scrollElement.removeEventListener("touchmove", onTouchMove);
      scrollElement.removeEventListener("touchend", onTouchEnd);
      scrollElement.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [enableAutoScroll, finishUserScroll, isMobile, messageListRef]);

  return {
    enableAutoScroll,
    isAutoScrollEnabledRef,
    userScrollActivity,
  };
}
