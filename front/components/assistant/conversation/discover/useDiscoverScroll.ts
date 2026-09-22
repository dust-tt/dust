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

  const goToDiscover = useCallback(() => {
    // Hold the ring at full while the page travels, so completing it reads
    // as the cause of the move; it resets once Discover has landed.
    fillRef.current = 1;
    setFillProgress(1);
    setStage("transition");
    discoverRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

    let fallbackTimer = 0;
    const land = () => {
      window.clearTimeout(fallbackTimer);
      scroller?.removeEventListener("scrollend", land);
      setStage("discover");
      fillRef.current = 0;
      setFillProgress(0);
    };
    fallbackTimer = window.setTimeout(land, TRANSITION_FALLBACK_MS);
    scroller?.addEventListener("scrollend", land);
  }, [scroller]);

  // A fresh scroller is a fresh home page: whatever stage the previous visit
  // ended on, this one starts at the top with an empty ring.
  useEffect(() => {
    if (!scroller) {
      return;
    }
    setStage("home");
    setFillProgress(0);
    fillRef.current = 0;
  }, [scroller]);

  // Wheel intent on the home stage fills the button instead of scrolling;
  // during the transition it is swallowed so the animation completes.
  useEffect(() => {
    if (!scroller || !isFillEnabled || stage === "discover") {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      if (stage === "transition") {
        event.preventDefault();
        return;
      }
      if (event.deltaY <= 0) {
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

    scroller.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      scroller.removeEventListener("wheel", handleWheel);
      if (idleTimerRef.current) {
        window.clearTimeout(idleTimerRef.current);
      }
    };
  }, [goToDiscover, isFillEnabled, scroller, stage]);

  // On the discover stage, scrolling back to the very top hands control back
  // to the home stage. On the home stage the scroller is locked to wheel
  // input, but focus() and scrollIntoView() can still move it, so any stray
  // offset snaps back to the top.
  useEffect(() => {
    if (!scroller || !isFillEnabled || stage === "transition") {
      return;
    }
    const handleScroll = () => {
      if (stage === "discover") {
        if (scroller.scrollTop <= 0) {
          setStage("home");
        }
      } else if (scroller.scrollTop > 0) {
        scroller.scrollTop = 0;
      }
    };
    scroller.addEventListener("scroll", handleScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", handleScroll);
  }, [isFillEnabled, scroller, stage]);

  return { discoverRef, fillProgress, goToDiscover, scrollerRef: setScroller };
}
