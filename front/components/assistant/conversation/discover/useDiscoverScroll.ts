import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { useCallback, useEffect, useRef, useState } from "react";

// Fallback for browsers without `scrollend`, and for a scroll that never
// starts because Discover is already in view.
const TRANSITION_FALLBACK_MS = 800;

type DiscoverStage = "home" | "transition" | "discover";

interface UseDiscoverScrollParams {
  isLockEnabled: boolean;
}

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

export function useDiscoverScroll({ isLockEnabled }: UseDiscoverScrollParams) {
  // State rather than a ref: the scroller comes and goes with the new-conversation route,
  // and the listeners below have to rebind to whichever node is on screen.
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const discoverRef = useRef<HTMLDivElement>(null);
  const [stage, setRenderedStage] = useState<DiscoverStage>("home");
  const stageRef = useRef<DiscoverStage>("home");
  const endTransitionRef = useRef<(() => void) | null>(null);

  const setStage = useCallback((nextStage: DiscoverStage) => {
    // Native scroll events can arrive before React commits the new stage.
    stageRef.current = nextStage;
    setRenderedStage(nextStage);
  }, []);

  // No scroller on mobile, where the button still has to move the page.
  const goToDiscover = useCallback(() => {
    endTransitionRef.current?.();
    setStage("transition");

    const cancel = onScrollSettled(scroller ?? window, () => {
      endTransitionRef.current = null;
      setStage("discover");
    });
    endTransitionRef.current = () => {
      cancel();
      endTransitionRef.current = null;
    };
    discoverRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [scroller, setStage]);

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
    setStage("home");
  }, [scroller, setStage]);

  useEffect(() => {
    if (!scroller || stage !== "transition") {
      return;
    }

    const handleWheel = (event: WheelEvent) => event.preventDefault();

    scroller.addEventListener("wheel", handleWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", handleWheel);
  }, [scroller, stage]);

  useEffect(() => {
    if (!scroller || !isLockEnabled) {
      return;
    }

    const handleScroll = () => {
      switch (stageRef.current) {
        case "discover":
          if (scroller.scrollTop <= 0) {
            setStage("home");
          }
          return;
        case "home":
          // Hidden overflow blocks user scrolling, but focus can still move it.
          if (scroller.scrollTop > 0) {
            scroller.scrollTop = 0;
          }
          return;
        case "transition":
          return;
        default:
          assertNeverAndIgnore(stageRef.current);
      }
    };

    scroller.addEventListener("scroll", handleScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", handleScroll);
  }, [isLockEnabled, scroller, setStage]);

  return {
    alignDiscover,
    discoverRef,
    goToDiscover,
    goToHome,
    isOpeningDiscover: stage === "transition",
    isScrollLocked: isLockEnabled && stage !== "discover",
    scrollerRef: setScroller,
  };
}
