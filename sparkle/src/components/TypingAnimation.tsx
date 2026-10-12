import { prefersReducedMotion } from "@sparkle/lib/internal_utils";
import { cn } from "@sparkle/lib/utils";
import React, { useEffect, useMemo, useRef, useState } from "react";

// Matches the `duration-200` of each character's fade-in.
const FADE_IN_MS = 200;

interface TypingAnimationProps {
  text: string;
  /** Delay in milliseconds between each revealed character (defaults to 50). */
  duration?: number;
  className?: string;
  /** Called once the full text has been revealed. */
  onComplete?: () => void;
}

/**
 * Reveals a string one character at a time, each fading in, to mimic live typing. Use it for
 * playful intros, hero text, or to suggest an agent is "typing" a short message, keeping `text`
 * concise so the reveal does not feel slow; for streaming model output that genuinely
 * arrives token-by-token, render the real tokens rather than this decorative effect.
 *
 * @summary Character-by-character typing effect.
 */
export function TypingAnimation({
  text,
  duration = 50,
  className,
  onComplete,
}: TypingAnimationProps) {
  // Code points, so that surrogate pairs (emoji) are never split.
  const characters = useMemo(() => Array.from(text), [text]);
  const [reduceMotion] = useState(prefersReducedMotion);
  // Start at one to avoid an empty text as first display as it sometimes shrinks the container.
  const initialCount = reduceMotion
    ? characters.length
    : Math.min(1, characters.length);
  const [progress, setProgress] = useState({ text, count: initialCount });
  // A new `text` restarts the animation rather than showing the previous text's progress.
  const revealedCount = progress.text === text ? progress.count : initialCount;

  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  // Read when an animation starts, so changing it neither restarts nor re-completes it.
  const durationMsRef = useRef(duration);
  durationMsRef.current = duration;

  useEffect(() => {
    const durationMs = durationMsRef.current;
    let count = initialCount;
    let completeTimeout: ReturnType<typeof setTimeout> | undefined;
    const typingEffect = setInterval(() => {
      if (count < characters.length) {
        count += 1;
        setProgress({ text, count });
      } else {
        clearInterval(typingEffect);
        // Complete once the last character, revealed one tick ago, has fully faded in.
        completeTimeout = setTimeout(
          () => onCompleteRef.current?.(),
          reduceMotion ? 0 : Math.max(0, FADE_IN_MS - durationMs)
        );
      }
    }, durationMs);

    return () => {
      clearInterval(typingEffect);
      clearTimeout(completeTimeout);
    };
  }, [characters, initialCount, reduceMotion, text]);

  return (
    // Keyed by text so that a new text fades in from its first character again.
    <span key={text} className={cn("notranslate", className)}>
      {characters.slice(0, revealedCount).map((character, index) => (
        <span
          key={index}
          className="animate-in fade-in-0 duration-200 ease-enter motion-reduce:animate-none"
        >
          {character}
        </span>
      ))}
    </span>
  );
}
