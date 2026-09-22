import { assertNever } from "@app/types/shared/utils/assert_never";
import { useCallback, useEffect, useRef, useState } from "react";

// Accumulated wheel delta that closes the ring.
const FILL_DISTANCE_PX = 900;
const FILL_IDLE_RESET_MS = 700;
// Fallback for browsers without `scrollend`, and for a scroll that never
// starts because Discover is already in view.
const TRANSITION_FALLBACK_MS = 800;

// `transition` keeps the scroller locked while the smooth scroll to the
// Discover page plays, so a trailing wheel tick cannot interrupt it midway.
type DiscoverStage = "home" | "transition" | "discover";

interface UseDiscoverScrollParams {
  isFillEnabled: boolean;
}

// Wheeling a nested scrollable, a long draft in the composer for instance, is reading rather
// than intent to leave the home page.
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

export function useDiscoverScroll({ isFillEnabled }: UseDiscoverScrollParams) {
  // The scroller only exists on the new-conversation route, so it comes and
  // goes while this hook stays mounted. Held as state, not a ref, so the
  // listeners below rebind to whichever node is currently on screen.
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const discoverRef = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<DiscoverStage>("home");
  const [fillProgress, setFillProgress] = useState(0);
  const fillRef = useRef(0);
  const idleTimerRef = useRef<number | null>(null);
  const endTransitionRef = useRef<(() => void) | null>(null);

  // Locking the scroller is what keeps the home stage in place: a wheel, a page down or a
  // space bar then does nothing, rather than moving and being snapped back. Radix rewrites
  // the viewport's inline overflow on every scroll-state change, so the lock has to outrank
  // it.
  useEffect(() => {
    if (!scroller) {
      return;
    }
    if (isFillEnabled && stage === "home") {
      scroller.style.setProperty("overflow-y", "hidden", "important");
    } else {
      scroller.style.removeProperty("overflow-y");
    }

    return () => {
      scroller.style.removeProperty("overflow-y");
    };
  }, [isFillEnabled, scroller, stage]);

  // No scroller on mobile: the button still has to move the page, so everything below the
  // scrollIntoView is optional.
  const goToDiscover = useCallback(() => {
    endTransitionRef.current?.();

    // Hold the ring at full while the page travels, so completing it reads
    // as the cause of the move; it resets once Discover has landed.
    fillRef.current = 1;
    setFillProgress(1);
    setStage("transition");
    // The lock effect has not run for the new stage yet, and scrollIntoView needs a scroller
    // that can move.
    scroller?.style.removeProperty("overflow-y");
    discoverRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

    let fallbackTimer = 0;
    const endTransition = () => {
      window.clearTimeout(fallbackTimer);
      scroller?.removeEventListener("scrollend", land);
      endTransitionRef.current = null;
    };
    const land = () => {
      endTransition();
      setStage("discover");
      fillRef.current = 0;
      setFillProgress(0);
    };

    fallbackTimer = window.setTimeout(land, TRANSITION_FALLBACK_MS);
    scroller?.addEventListener("scrollend", land);
    endTransitionRef.current = endTransition;
  }, [scroller]);

  useEffect(() => () => endTransitionRef.current?.(), []);

  // A fresh scroller is a fresh home page: whatever stage the previous visit
  // ended on, this one starts at the top with an empty ring.
  useEffect(() => {
    endTransitionRef.current?.();
    if (!scroller) {
      return;
    }
    setStage("home");
    setFillProgress(0);
    fillRef.current = 0;
  }, [scroller]);

  // Wheel intent on the home stage fills the button; during the transition it is swallowed
  // so the animation completes.
  useEffect(() => {
    if (!scroller || !isFillEnabled) {
      return;
    }

    const fill = (event: WheelEvent) => {
      if (event.deltaY <= 0 || isOverScrollableRegion(event.target, scroller)) {
        return;
      }
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
      switch (stage) {
        case "home":
          fill(event);
          return;
        case "transition":
          event.preventDefault();
          return;
        case "discover":
          return;
        default:
          assertNever(stage);
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

  // On the discover stage, scrolling back to the very top hands control back to the home
  // stage.
  useEffect(() => {
    if (!scroller || !isFillEnabled) {
      return;
    }

    const handleScroll = () => {
      switch (stage) {
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
          assertNever(stage);
      }
    };

    scroller.addEventListener("scroll", handleScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", handleScroll);
  }, [isFillEnabled, scroller, stage]);

  return { discoverRef, fillProgress, goToDiscover, scrollerRef: setScroller };
}
