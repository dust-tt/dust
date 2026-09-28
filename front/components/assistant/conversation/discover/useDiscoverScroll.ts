import { useCallback, useEffect, useRef, useState } from "react";

// Fallback for browsers without `scrollend`, and for a scroll that never
// starts because Discover is already in view.
const TRANSITION_FALLBACK_MS = 800;

function onScrollSettled(
  target: HTMLElement | Window,
  callback: () => void
): () => void {
  let fallbackTimer = 0;
  const cancel = () => {
    window.clearTimeout(fallbackTimer);
    target.removeEventListener("scrollend", land);
  };
  const land = () => {
    cancel();
    callback();
  };
  fallbackTimer = window.setTimeout(land, TRANSITION_FALLBACK_MS);
  target.addEventListener("scrollend", land);
  return cancel;
}

/**
 * @cc [owner:aubin-tchoi,label:product] allow-native-discovery-scrolling
 * Outside the button's opening transition, scrolling between Home and Discover
 * must remain enabled and must not force the viewport back to Home.
 */
export function useDiscoverScroll() {
  // State rather than a ref: the scroller comes and goes with the new-conversation route,
  // and the listeners below have to rebind to whichever node is on screen.
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const discoverRef = useRef<HTMLDivElement>(null);
  const [isOpeningDiscover, setIsOpeningDiscover] = useState(false);
  const endTransitionRef = useRef<(() => void) | null>(null);

  // No scroller on mobile, where the button still has to move the page.
  const goToDiscover = useCallback(() => {
    endTransitionRef.current?.();
    setIsOpeningDiscover(true);
    discoverRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

    const cancel = onScrollSettled(scroller ?? window, () => {
      endTransitionRef.current = null;
      setIsOpeningDiscover(false);
    });
    endTransitionRef.current = () => {
      cancel();
      endTransitionRef.current = null;
    };
  }, [scroller]);

  const alignDiscover = useCallback(() => {
    window.requestAnimationFrame(() => {
      const discover = discoverRef.current;
      if (!scroller || !discover) {
        return;
      }
      const offset =
        discover.getBoundingClientRect().top -
        scroller.getBoundingClientRect().top;
      if (Math.abs(offset) >= 1) {
        scroller.scrollTo({
          top: scroller.scrollTop + offset,
          behavior: "smooth",
        });
      }
    });
  }, [scroller]);

  const goToHome = useCallback(
    () =>
      new Promise<void>((resolve) => {
        const target = scroller ?? document.scrollingElement;
        if (!target || target.scrollTop <= 0) {
          resolve();
          return;
        }

        onScrollSettled(scroller ?? window, resolve);
        target.scrollTo({ top: 0, behavior: "smooth" });
      }),
    [scroller]
  );

  useEffect(() => () => endTransitionRef.current?.(), []);

  // A fresh scroller is a fresh home page.
  useEffect(() => {
    endTransitionRef.current?.();
    if (!scroller) {
      return;
    }
    setIsOpeningDiscover(false);
  }, [scroller]);

  useEffect(() => {
    if (!scroller || !isOpeningDiscover) {
      return;
    }

    const handleWheel = (event: WheelEvent) => event.preventDefault();

    scroller.addEventListener("wheel", handleWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", handleWheel);
  }, [scroller, isOpeningDiscover]);

  return {
    alignDiscover,
    discoverRef,
    goToDiscover,
    goToHome,
    isOpeningDiscover,
    scrollerRef: setScroller,
  };
}
