import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

const FILL_DISTANCE_PX = 900;
const FILL_IDLE_RESET_MS = 700;
// Fallback for browsers without `scrollend`, and for a scroll that never
// starts because Discover is already in view.
const TRANSITION_FALLBACK_MS = 800;

// `transition` swallows wheel ticks so they cannot interrupt the smooth scroll midway.
type DiscoverStage = "home" | "transition" | "discover";

interface UseDiscoverScrollParams {
  isFillEnabled: boolean;
}

// Wheeling a long draft in the composer is reading, not intent to leave the home page.
function isOverScrollableRegion(
  target: EventTarget | null,
  boundary: HTMLElement
): boolean {
  let node = target instanceof Element ? target : null;

  while (node && node !== boundary) {
    if (node.scrollHeight > node.clientHeight) {
      const { overflowY } = window.getComputedStyle(node);
      if (overflowY === "auto" || overflowY === "scroll") {
        return true;
      }
    }
    node = node.parentElement;
  }

  return false;
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

/**
 * @cc [owner:aubin-tchoi,label:product] discover-scroll-to-fill
 * With desktop filling enabled, downward wheel input outside nested scrollable
 * content must fill the Discover button before opening it. Partial fills reset
 * after idle; reaching full progress must open Discover without snapping Home.
 */
export function useDiscoverScroll({ isFillEnabled }: UseDiscoverScrollParams) {
  // State rather than a ref: the scroller comes and goes with the new-conversation route,
  // and the listeners below have to rebind to whichever node is on screen.
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const discoverRef = useRef<HTMLDivElement>(null);
  const [stage, setRenderedStage] = useState<DiscoverStage>("home");
  const stageRef = useRef<DiscoverStage>("home");
  const [fillProgress, setFillProgress] = useState(0);
  const fillRef = useRef(0);
  const idleTimerRef = useRef<number | null>(null);
  const endTransitionRef = useRef<(() => void) | null>(null);
  const shouldReduceMotion = useReducedMotion();

  const setStage = useCallback((nextStage: DiscoverStage) => {
    // Native scroll events can arrive before React commits the new stage.
    stageRef.current = nextStage;
    setRenderedStage(nextStage);
  }, []);

  // No scroller on mobile, where the button still has to move the page.
  const goToDiscover = useCallback(() => {
    endTransitionRef.current?.();

    // Hold the ring at full while the page travels, so completing it reads as the cause.
    fillRef.current = 1;
    setFillProgress(1);
    setStage("transition");
    const cancel = onScrollSettled(scroller ?? window, () => {
      endTransitionRef.current = null;
      setStage("discover");
      fillRef.current = 0;
      setFillProgress(0);
    });
    endTransitionRef.current = () => {
      cancel();
      endTransitionRef.current = null;
    };
    discoverRef.current?.scrollIntoView({
      behavior: shouldReduceMotion ? "instant" : "smooth",
      block: "start",
    });
  }, [scroller, setStage, shouldReduceMotion]);

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
          behavior: shouldReduceMotion ? "instant" : "smooth",
        });
      }
    });
  }, [scroller, shouldReduceMotion]);

  const goToHome = useCallback(
    () =>
      new Promise<void>((resolve) => {
        const target = scroller ?? document.scrollingElement;
        if (!target || target.scrollTop <= 0) {
          resolve();
          return;
        }

        onScrollSettled(scroller ?? window, resolve);
        target.scrollTo({
          top: 0,
          behavior: shouldReduceMotion ? "instant" : "smooth",
        });
      }),
    [scroller, shouldReduceMotion]
  );

  useEffect(() => () => endTransitionRef.current?.(), []);

  // A fresh scroller is a fresh home page.
  useEffect(() => {
    endTransitionRef.current?.();
    if (!scroller) {
      return;
    }
    setStage("home");
    setFillProgress(0);
    fillRef.current = 0;
  }, [scroller, setStage]);

  useEffect(() => {
    if (!scroller || !isFillEnabled || stage === "discover") {
      return;
    }

    const fill = (event: WheelEvent) => {
      if (
        event.ctrlKey ||
        event.deltaY <= 0 ||
        isOverScrollableRegion(event.target, scroller)
      ) {
        return;
      }
      event.preventDefault();
      fillRef.current = Math.min(
        1,
        fillRef.current + event.deltaY / FILL_DISTANCE_PX
      );
      setFillProgress(fillRef.current);

      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
      }
      if (fillRef.current >= 1) {
        goToDiscover();
        return;
      }
      idleTimerRef.current = window.setTimeout(() => {
        fillRef.current = 0;
        setFillProgress(0);
      }, FILL_IDLE_RESET_MS);
    };

    const handleWheel = (event: WheelEvent) => {
      switch (stageRef.current) {
        case "home":
          fill(event);
          return;
        case "transition":
          event.preventDefault();
          return;
        case "discover":
          return;
        default:
          assertNeverAndIgnore(stageRef.current);
      }
    };

    scroller.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      scroller.removeEventListener("wheel", handleWheel);
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
      }
    };
  }, [goToDiscover, isFillEnabled, scroller, stage]);

  useEffect(() => {
    if (!scroller || !isFillEnabled) {
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
          // The scroller is locked, but focus() and scrollIntoView() still move it.
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
  }, [isFillEnabled, scroller, setStage]);

  return {
    alignDiscover,
    discoverRef,
    fillProgress,
    goToDiscover,
    goToHome,
    isScrollLocked: isFillEnabled && stage === "home",
    scrollerRef: setScroller,
  };
}
