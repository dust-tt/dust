import type { VirtuosoMessageListMethods } from "@virtuoso.dev/message-list";
import type { RefObject } from "react";
import { useEffect, useRef, useState } from "react";

type ConversationScrollMethods = Pick<
  VirtuosoMessageListMethods,
  | "cancelSmoothScroll"
  | "getScrollLocation"
  | "scrollerElement"
  | "scrollToItem"
> & {
  data: Pick<VirtuosoMessageListMethods["data"], "get">;
};

const BOTTOM_THRESHOLD_PX = 4;

interface UseConversationAutoScrollProps {
  isMobile: boolean;
  messageListRef: RefObject<ConversationScrollMethods | null>;
}

export function useConversationAutoScroll({
  isMobile,
  messageListRef,
}: UseConversationAutoScrollProps) {
  const isAutoScrollEnabledRef = useRef(true);
  const beforeResizeRef = useRef<ResizeObserverCallback | null>(null);
  // Observer callbacks run in creation order. This one must be created before
  // the child Virtuoso list creates its own observer.
  const [beforeResizeObserver] = useState(() =>
    typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver((entries, observer) => {
          beforeResizeRef.current?.(entries, observer);
        })
  );

  useEffect(() => {
    const methods = messageListRef.current;
    const listElement = methods?.scrollerElement();
    const scrollElement = isMobile ? document.scrollingElement : listElement;
    if (!methods || !listElement || !(scrollElement instanceof HTMLElement)) {
      return;
    }

    const scrollTarget = isMobile ? window : scrollElement;
    let previousScrollTop = scrollElement.scrollTop;
    let previousScrollHeight = scrollElement.scrollHeight;
    let previousItemCount = methods.data.get().length;
    let direction: "up" | "down" | null = null;
    let lastTouchY: number | null = null;
    let contentElement: HTMLElement | null = null;
    let previousTranslation = 0;
    let translationItemCount = previousItemCount;
    let isChangingItemCount = false;

    const reattachAtBottom = () => {
      const viewportHeight = isMobile
        ? window.innerHeight
        : scrollElement.clientHeight;
      // The scrollable height includes the sticky input bar. At this boundary,
      // the last message is visible above it, rather than hidden behind it.
      const bottomOffset = isMobile
        ? listElement.getBoundingClientRect().bottom - viewportHeight
        : scrollElement.scrollHeight - scrollElement.scrollTop - viewportHeight;
      if (
        !isAutoScrollEnabledRef.current &&
        direction === "down" &&
        previousTranslation === 0 &&
        bottomOffset <= BOTTOM_THRESHOLD_PX
      ) {
        isAutoScrollEnabledRef.current = true;
        // Make the last few pixels visible above the floating input bar.
        methods.scrollToItem({
          index: "LAST",
          align: "end",
          behavior: "instant",
        });
      }
    };

    // On iOS, Virtuoso defers its scrollTop compensation with a transform
    // until scrolling stops. Cancel that visual displacement without writing
    // scrollTop during the touch gesture, which would interrupt momentum.
    const syncTranslation = () => {
      if (!isMobile || !contentElement) {
        return;
      }
      const translation = new DOMMatrixReadOnly(contentElement.style.transform)
        .m42;
      const itemCount = methods.data.get().length;
      if (itemCount !== translationItemCount) {
        isChangingItemCount = true;
        translationItemCount = itemCount;
      }
      // Prepending history also uses a transform, but that movement anchors
      // the existing messages and must be kept.
      if (isChangingItemCount) {
        previousTranslation = 0;
        isChangingItemCount = translation !== 0;
        if (contentElement.style.translate) {
          contentElement.style.translate = "";
        }
        return;
      }
      if (!isAutoScrollEnabledRef.current) {
        if (translation === 0 && previousTranslation !== 0) {
          const maxScrollTop = scrollElement.scrollHeight - window.innerHeight;
          const compensation = Math.max(
            -previousScrollTop,
            Math.min(-previousTranslation, maxScrollTop - previousScrollTop)
          );
          scrollElement.scrollTop -= compensation;
          previousScrollTop = scrollElement.scrollTop;
        }
        const translate = `0px ${-translation}px`;
        if (contentElement.style.translate !== translate) {
          contentElement.style.translate = translate;
        }
      } else if (contentElement.style.translate) {
        contentElement.style.translate = "";
      }
      previousTranslation = translation;
      reattachAtBottom();
    };

    const detach = () => {
      if (isAutoScrollEnabledRef.current) {
        isAutoScrollEnabledRef.current = false;
        methods.cancelSmoothScroll();
        previousScrollTop = scrollElement.scrollTop;
        previousScrollHeight = scrollElement.scrollHeight;
      }
    };

    const onScroll = () => {
      syncTranslation();
      const scrollTopDelta = scrollElement.scrollTop - previousScrollTop;
      const scrollHeightDelta =
        scrollElement.scrollHeight - previousScrollHeight;

      if (scrollHeightDelta === 0 && scrollTopDelta !== 0) {
        direction = scrollTopDelta < 0 ? "up" : "down";
      }

      if (scrollTopDelta < 0 && scrollHeightDelta >= 0) {
        detach();
      }

      const { isAtBottom, bottomOffset } = methods.getScrollLocation();
      if (!isAutoScrollEnabledRef.current && isAtBottom && bottomOffset > 0) {
        // isAtBottom also includes an active bottom target after cancellation.
        // Clear it after the native scroll moves, so growth cannot pull us back.
        methods.scrollToItem({
          index: 0,
          align: "start-no-overflow",
          offset: isMobile
            ? -listElement.getBoundingClientRect().top
            : scrollElement.scrollTop,
          behavior: "instant",
        });
      }

      if (scrollTopDelta > 0) {
        reattachAtBottom();
      }

      previousScrollTop = scrollElement.scrollTop;
      previousScrollHeight = scrollElement.scrollHeight;
    };

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || event.deltaY === 0) {
        return;
      }
      direction = event.deltaY < 0 ? "up" : "down";
      if (direction === "up") {
        detach();
      }
    };

    const onTouchStart = (event: TouchEvent) => {
      lastTouchY = event.touches.length === 1 ? event.touches[0].clientY : null;
    };

    const onTouchMove = (event: TouchEvent) => {
      if (event.touches.length !== 1) {
        lastTouchY = null;
        return;
      }
      const touchY = event.touches[0].clientY;
      if (lastTouchY !== null && touchY !== lastTouchY) {
        direction = touchY > lastTouchY ? "up" : "down";
        if (direction === "up") {
          detach();
        }
      }
      lastTouchY = touchY;
    };

    const rowHeights = new WeakMap<Element, number>();
    let scrollTopBeforeResize = scrollElement.scrollTop;
    let preserveScrollPosition = false;
    beforeResizeRef.current = (entries) => {
      scrollTopBeforeResize = scrollElement.scrollTop;
      preserveScrollPosition = false;
      const viewportTop = isMobile
        ? 0
        : listElement.getBoundingClientRect().top;
      for (const entry of entries) {
        const previousHeight = rowHeights.get(entry.target);
        const height = entry.contentRect.height;
        rowHeights.set(entry.target, height);
        if (
          previousHeight !== undefined &&
          height !== previousHeight &&
          entry.target.getBoundingClientRect().top + previousHeight >
            viewportTop
        ) {
          preserveScrollPosition = true;
        }
      }
      preserveScrollPosition &&=
        !isAutoScrollEnabledRef.current &&
        methods.data.get().length === previousItemCount;
    };
    // This observer is created after Virtuoso's. Restore only movement caused
    // by measuring existing rows, preserving the native scroll before that
    // measurement and Virtuoso's anchoring when history is prepended.
    const resizeObserver = new ResizeObserver(() => {
      if (
        preserveScrollPosition &&
        scrollElement.scrollTop !== scrollTopBeforeResize
      ) {
        scrollElement.scrollTop = scrollTopBeforeResize;
      }
      previousScrollHeight = scrollElement.scrollHeight;
      previousScrollTop = scrollElement.scrollTop;
      previousItemCount = methods.data.get().length;
    });
    const translationObserver = new MutationObserver(syncTranslation);
    const observeContent = () => {
      resizeObserver.disconnect();
      beforeResizeObserver?.disconnect();
      translationObserver.disconnect();
      contentElement = listElement.querySelector(
        '[data-testid="virtuoso-list"]'
      );
      if (contentElement) {
        translationObserver.observe(contentElement, {
          attributes: true,
          attributeFilter: ["style"],
        });
        mutationObserver.observe(contentElement, { childList: true });
        for (const row of contentElement.children) {
          beforeResizeObserver?.observe(row);
          resizeObserver.observe(row);
        }
      }
    };
    const mutationObserver = new MutationObserver(observeContent);
    mutationObserver.observe(listElement, { childList: true });
    observeContent();

    scrollTarget.addEventListener("scroll", onScroll, { passive: true });
    listElement.addEventListener("wheel", onWheel, { passive: true });
    listElement.addEventListener("touchstart", onTouchStart, { passive: true });
    listElement.addEventListener("touchmove", onTouchMove, { passive: true });
    return () => {
      resizeObserver.disconnect();
      beforeResizeObserver?.disconnect();
      beforeResizeRef.current = null;
      mutationObserver.disconnect();
      translationObserver.disconnect();
      if (contentElement) {
        contentElement.style.translate = "";
      }
      scrollTarget.removeEventListener("scroll", onScroll);
      listElement.removeEventListener("wheel", onWheel);
      listElement.removeEventListener("touchstart", onTouchStart);
      listElement.removeEventListener("touchmove", onTouchMove);
    };
  }, [beforeResizeObserver, isMobile, messageListRef]);

  return isAutoScrollEnabledRef;
}
