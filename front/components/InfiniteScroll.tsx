import { useSheetViewport } from "@dust-tt/sparkle";
import type { ReactNode } from "react";
import { useCallback, useEffect, useRef } from "react";
import type { IntersectionOptions } from "react-intersection-observer";
import { useInView } from "react-intersection-observer";

export type InfiniteScrollProps = {
  nextPage: () => void;
  hasMore: boolean;
  showLoader: boolean;
  loader: ReactNode;
  options?: IntersectionOptions;
};

function getBottomRootMargin(rootMargin?: string): number {
  if (!rootMargin) {
    return 0;
  }

  const parts = rootMargin.trim().split(/\s+/);
  if (parts.length === 1) {
    return Number.parseFloat(parts[0]) || 0;
  }
  if (parts.length === 4) {
    return Number.parseFloat(parts[2]) || 0;
  }

  return 0;
}

function isScrollContainer(
  root: IntersectionObserverInit["root"]
): root is HTMLElement {
  return root instanceof HTMLElement && root.isConnected;
}

/**
 * Infinite scroll helper. When `options.root` is a scroll container, uses scroll
 * position (reliable with Radix ScrollArea). Otherwise falls back to an
 * intersection observer sentinel.
 */
export const InfiniteScroll = ({
  nextPage,
  hasMore,
  showLoader,
  loader,
  options,
}: InfiniteScrollProps) => {
  const sheetViewport = useSheetViewport();
  const scrollRootCandidate = options?.root ?? sheetViewport;
  const scrollRoot = isScrollContainer(scrollRootCandidate)
    ? scrollRootCandidate
    : null;
  const bottomMargin = getBottomRootMargin(
    typeof options?.rootMargin === "string" ? options.rootMargin : undefined
  );

  const nextPageRef = useRef(nextPage);
  nextPageRef.current = nextPage;

  const hasMoreRef = useRef(hasMore);
  hasMoreRef.current = hasMore;

  const scrollRootRef = useRef(scrollRoot);
  scrollRootRef.current = scrollRoot;

  const bottomMarginRef = useRef(bottomMargin);
  bottomMarginRef.current = bottomMargin;

  const checkScrollPosition = useCallback(() => {
    const root = scrollRootRef.current;
    if (!root || !hasMoreRef.current) {
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = root;
    if (scrollHeight - scrollTop - clientHeight <= bottomMarginRef.current) {
      void nextPageRef.current();
    }
  }, []);

  useEffect(() => {
    if (!scrollRoot) {
      return;
    }

    scrollRoot.addEventListener("scroll", checkScrollPosition, {
      passive: true,
    });

    const resizeObserver = new ResizeObserver(() => {
      checkScrollPosition();
    });
    resizeObserver.observe(scrollRoot);
    const content = scrollRoot.firstElementChild;
    if (content) {
      resizeObserver.observe(content);
    }

    checkScrollPosition();

    return () => {
      scrollRoot.removeEventListener("scroll", checkScrollPosition);
      resizeObserver.disconnect();
    };
  }, [scrollRoot, checkScrollPosition]);

  // Intersection observer sentinel — only used when there is no explicit scroll root,
  // because IntersectionObserver is unreliable inside Radix ScrollArea viewports.
  const { ref, inView } = useInView(scrollRoot ? undefined : options);

  useEffect(() => {
    if (scrollRoot) {
      return;
    }
    if (inView && hasMoreRef.current) {
      void nextPageRef.current();
    }
  }, [scrollRoot, inView]);

  return (
    <>
      {!scrollRoot && hasMore && <div ref={ref} className="h-px shrink-0" />}
      {showLoader && loader}
    </>
  );
};
