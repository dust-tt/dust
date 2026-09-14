import React, { useEffect, useRef, useState } from "react";

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
  onComplete,
}: TypingAnimationProps) {
  const [displayedText, setDisplayedText] = useState<string>(
    text.substring(0, 1)
  );
  // Start at one to avoid an empty text as first display as it sometimes shrinks the container.
  const [i, setI] = useState<number>(Math.min(1, text.length));
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    const typingEffect = setInterval(() => {
      if (i < text.length) {
        setDisplayedText(text.substring(0, i + 1));
        setI(i + 1);
      } else {
        clearInterval(typingEffect);
        onCompleteRef.current?.();
      }
    }, duration);

    return () => {
      clearInterval(typingEffect);
    };
  }, [duration, i, text]);

  return <span className="notranslate">{displayedText}</span>;
}
