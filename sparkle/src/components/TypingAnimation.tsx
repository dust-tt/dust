import { prefersReducedMotion } from "@sparkle/lib/internal_utils";
import { cn } from "@sparkle/lib/utils";
import React, { useEffect, useMemo, useRef, useState } from "react";

interface TypingAnimationProps {
  text: string;
  /** Delay in milliseconds between each revealed character (defaults to 50). */
  duration?: number;
  className?: string;
  /** Called once the full text has been revealed. */
  onComplete?: () => void;
}

/**
 * Reveals a string one character at a time to mimic live typing. Use it for playful
 * intros, hero text, or to suggest an agent is "typing" a short message, keeping `text`
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
    let count = initialCount;
    const typingEffect = setInterval(() => {
      if (count < characters.length) {
        count += 1;
        setProgress({ text, count });
      } else {
        clearInterval(typingEffect);
        onCompleteRef.current?.();
      }
    }, durationMsRef.current);

    return () => {
      clearInterval(typingEffect);
    };
  }, [characters, initialCount, text]);

  return (
    <span className={cn("notranslate", className)}>
      {characters.slice(0, revealedCount).join("")}
    </span>
  );
}
