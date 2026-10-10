import { MOTION_EASINGS } from "@dust-tt/sparkle";
import {
  type CSSProperties,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

// ── Hero entrance (front/components/assistant/conversation/ConversationContainer.tsx)
// Shared "fade + rise + blur" entrance for the empty-state hero: the greeting
// words, the composer and the Discover button each play it once, offset so
// they appear in that order without waiting on one another to finish. See
// `fade-rise-blur-in` in index.css for the keyframe.

const HERO_ENTER_EASE = `cubic-bezier(${MOTION_EASINGS.emphasized.join(", ")})`;

export interface HeroEntranceStyle extends CSSProperties {
  "--hero-entrance-y": string;
  "--hero-entrance-blur": string;
}

export function heroEntranceStyle({
  yPx,
  blurPx,
  durationSeconds,
  delaySeconds,
}: {
  yPx: number;
  blurPx: number;
  durationSeconds: number;
  delaySeconds: number;
}): HeroEntranceStyle {
  return {
    "--hero-entrance-y": `${yPx}px`,
    "--hero-entrance-blur": `${blurPx}px`,
    animation:
      `fade-rise-blur-in ${durationSeconds}s ${HERO_ENTER_EASE} ` +
      `${delaySeconds}s backwards`,
  };
}

const GREETING_WORD_ENTER_Y_PX = 4;
const GREETING_WORD_ENTER_BLUR_PX = 3;
const GREETING_WORD_DURATION_SECONDS = 0.43;
const GREETING_WORD_STAGGER_SECONDS = 0.07;

export function greetingWordStyle(index: number): HeroEntranceStyle {
  return heroEntranceStyle({
    yPx: GREETING_WORD_ENTER_Y_PX,
    blurPx: GREETING_WORD_ENTER_BLUR_PX,
    durationSeconds: GREETING_WORD_DURATION_SECONDS,
    delaySeconds: index * GREETING_WORD_STAGGER_SECONDS,
  });
}

// Starts while the greeting is still animating in, rather than waiting for
// it to finish, so the hero appears as one flowing wave.
const COMPOSER_ENTER_DELAY_SECONDS = 0.13;
export const composerEntranceStyle = heroEntranceStyle({
  yPx: 6,
  blurPx: 3,
  durationSeconds: 0.28,
  delaySeconds: COMPOSER_ENTER_DELAY_SECONDS,
});

const DISCOVER_BUTTON_ENTER_DELAY_SECONDS = 0.3;
export const discoverButtonEntranceStyle = heroEntranceStyle({
  yPx: 8,
  blurPx: 3,
  durationSeconds: 0.28,
  delaySeconds: DISCOVER_BUTTON_ENTER_DELAY_SECONDS,
});

// ── Exit timing ─────────────────────────────────────────────────────────────
// Matches `--transition-duration-exit` in sparkle/src/styles/theme.css.
export const EXIT_DURATION_MS = 160;

/**
 * Keeps the last non-null value around for `EXIT_DURATION_MS` after it turns
 * null, so the element can play its exit transition before unmounting.
 * `isLeaving` is true during that window.
 */
export function useDelayedUnmount<T>(value: T | null): {
  shown: T | null;
  isLeaving: boolean;
} {
  const [retained, setRetained] = useState<T | null>(value);

  // Retention is inherently time-based, so it lives in an effect: the value
  // is kept while present and released once the exit window has elapsed.
  useEffect(() => {
    if (value !== null) {
      setRetained(value);
      return;
    }
    const timer = window.setTimeout(() => setRetained(null), EXIT_DURATION_MS);
    return () => window.clearTimeout(timer);
  }, [value]);

  return {
    shown: value ?? retained,
    isLeaving: value === null && retained !== null,
  };
}

/** Mirrors `prefers-reduced-motion: reduce`, live. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

// ── Typewriter ──────────────────────────────────────────────────────────────
// Types a string into a controlled input over a short burst: the run eases in
// and out so it reads as one confident keystroke sequence rather than a
// constant tick. Driven by elapsed time, not per-character timers, so dropped
// frames shorten nothing. Reduced motion places the text at once.

const TYPEWRITER_MIN_MS = 400;
const TYPEWRITER_MAX_MS = 900;
const TYPEWRITER_MS_PER_CHAR = 3.5;

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

export function useTypewriter(onChange: (value: string) => void): {
  type: (text: string) => void;
  cancel: () => void;
} {
  const frameRef = useRef<number | null>(null);
  const fallbackRef = useRef<number | null>(null);
  const reducedMotion = usePrefersReducedMotion();

  const cancel = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (fallbackRef.current !== null) {
      window.clearTimeout(fallbackRef.current);
      fallbackRef.current = null;
    }
  }, []);

  const type = useCallback(
    (text: string) => {
      cancel();
      if (reducedMotion) {
        onChange(text);
        return;
      }
      const duration = Math.min(
        TYPEWRITER_MAX_MS,
        Math.max(TYPEWRITER_MIN_MS, text.length * TYPEWRITER_MS_PER_CHAR)
      );
      const start = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - start) / duration);
        const shown = Math.round(easeInOutCubic(t) * text.length);
        onChange(text.slice(0, shown));
        if (t < 1) {
          frameRef.current = requestAnimationFrame(step);
        } else {
          cancel();
        }
      };
      frameRef.current = requestAnimationFrame(step);
      // Frames stop in a background tab; the text must still land in full.
      fallbackRef.current = window.setTimeout(() => {
        cancel();
        onChange(text);
      }, duration + 100);
    },
    [cancel, onChange, reducedMotion]
  );

  useEffect(() => cancel, [cancel]);

  return { type, cancel };
}
