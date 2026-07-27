import { useReducedMotion } from "framer-motion";
import React, { useEffect, useRef, useState } from "react";

interface TypingAnimationProps {
  text: string;
  duration?: number;
  className?: string;
  onComplete?: () => void;
}

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
  const shouldReduceMotion = useReducedMotion();

  // Under reduced motion the full text renders immediately; completion still
  // fires so callers waiting on it are not stuck.
  useEffect(() => {
    if (shouldReduceMotion) {
      onCompleteRef.current?.();
    }
  }, [shouldReduceMotion]);

  useEffect(() => {
    if (shouldReduceMotion) {
      return;
    }
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
  }, [duration, i, text, shouldReduceMotion]);

  return (
    <span className="notranslate">
      {shouldReduceMotion ? text : displayedText}
    </span>
  );
}
