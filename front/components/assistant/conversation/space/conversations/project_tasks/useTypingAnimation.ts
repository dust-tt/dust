import { useCallback, useEffect, useRef, useState } from "react";

interface UseTypingAnimationArgs {
  enabled: boolean;
  text: string;
}

interface TypingAnimationApi {
  isAnimating: boolean;
  sourceText: string;
  dismiss: () => void;
}

/**
 * Locks the source text once the animation starts so a re-render with a new
 * `text` value mid-animation doesn't make `<TypingAnimation>` jump.
 */
export function useTypingAnimation({
  enabled,
  text,
}: UseTypingAnimationArgs): TypingAnimationApi {
  const [dismissed, setDismissed] = useState(false);
  const lockedTextRef = useRef<string | null>(null);

  const isAnimating = enabled && !dismissed;

  useEffect(() => {
    if (!isAnimating) {
      lockedTextRef.current = null;
    }
  }, [isAnimating]);

  let sourceText = text;
  if (isAnimating) {
    if (lockedTextRef.current === null) {
      lockedTextRef.current = text;
    }
    sourceText = lockedTextRef.current;
  }

  const dismiss = useCallback(() => setDismissed(true), []);

  return { isAnimating, sourceText, dismiss };
}
