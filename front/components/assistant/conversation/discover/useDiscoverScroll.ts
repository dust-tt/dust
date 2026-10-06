import { trackDiscoverScrollPullOpen } from "@app/components/assistant/conversation/discover/discoveryTracking";
import { assertNeverAndIgnore } from "@app/types/shared/utils/assert_never";
import { MOTION_EASINGS } from "@dust-tt/sparkle";
import type { MotionValue } from "framer-motion";
import { animate, useMotionValue } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";

// Fallback for browsers without `scrollend`, and for a scroll that never
// starts because Discover is already in view.
const TRANSITION_FALLBACK_MS = 800;

const PULL_DISTANCE_PX = 250;
const PULL_RELEASE_DELAY_MS = 300;
const PULL_RELEASE_SECONDS = 0.25;
const PULL_COMPLETE_TOLERANCE = 1e-6;
const WHEEL_LINE_HEIGHT_PX = 16;

type DiscoverStage = "home" | "transition" | "discover";

interface UseDiscoverScrollParams {
  isLockEnabled: boolean;
}

function releasePull(pullProgress: MotionValue<number>) {
  return animate(pullProgress, 0, {
    duration: PULL_RELEASE_SECONDS,
    ease: MOTION_EASINGS.enter,
  });
}

function wheelDeltaPx(event: WheelEvent, pageHeightPx: number): number {
  switch (event.deltaMode) {
    case WheelEvent.DOM_DELTA_LINE:
      return event.deltaY * WHEEL_LINE_HEIGHT_PX;
    case WheelEvent.DOM_DELTA_PAGE:
      return event.deltaY * pageHeightPx;
    default:
      return event.deltaY;
  }
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
 * @cc [owner:adrsimon,label:react;product] home-scroll-pull-opens-discover
 * On the locked homepage, `PULL_DISTANCE_PX` of downward wheel MUST open Discover and fire
 * `trackDiscoverScrollPullOpen`. Wheel events from the input bar or with `ctrlKey` (pinch zoom)
 * MUST NOT move `pullProgress`, and a pull left idle for `PULL_RELEASE_DELAY_MS` MUST fall back
 * to 0.
 */
export function useDiscoverScroll({ isLockEnabled }: UseDiscoverScrollParams) {
  // State rather than a ref: the scroller comes and goes with the new-conversation route,
  // and the listeners below have to rebind to whichever node is on screen.
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const discoverRef = useRef<HTMLDivElement>(null);
  const inputBarRef = useRef<HTMLDivElement>(null);
  const [stage, setRenderedStage] = useState<DiscoverStage>("home");
  const stageRef = useRef<DiscoverStage>("home");
  const endTransitionRef = useRef<(() => void) | null>(null);
  const pullProgress = useMotionValue(0);

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
    if (stage !== "discover") {
      return;
    }
    const release = releasePull(pullProgress);
    return () => release.stop();
  }, [pullProgress, stage]);

  useEffect(() => {
    if (!scroller || !isLockEnabled || stage !== "home") {
      return;
    }

    let release = releasePull(pullProgress);
    let releaseTimer = 0;

    const handleWheel = (event: WheelEvent) => {
      if (
        event.ctrlKey ||
        (event.target instanceof Node &&
          inputBarRef.current?.contains(event.target))
      ) {
        return;
      }
      release.stop();
      window.clearTimeout(releaseTimer);
      const progress = Math.max(
        0,
        pullProgress.get() +
          wheelDeltaPx(event, scroller.clientHeight) / PULL_DISTANCE_PX
      );
      const isComplete = progress >= 1 - PULL_COMPLETE_TOLERANCE;
      pullProgress.set(isComplete ? 1 : progress);
      if (isComplete) {
        trackDiscoverScrollPullOpen();
        goToDiscover();
        return;
      }
      releaseTimer = window.setTimeout(() => {
        release = releasePull(pullProgress);
      }, PULL_RELEASE_DELAY_MS);
    };

    scroller.addEventListener("wheel", handleWheel, { passive: true });
    return () => {
      window.clearTimeout(releaseTimer);
      release.stop();
      scroller.removeEventListener("wheel", handleWheel);
    };
  }, [goToDiscover, isLockEnabled, pullProgress, scroller, stage]);

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
    inputBarRef,
    isOpeningDiscover: stage === "transition",
    isScrollLocked: isLockEnabled && stage !== "discover",
    pullProgress,
    scrollerRef: setScroller,
  };
}
