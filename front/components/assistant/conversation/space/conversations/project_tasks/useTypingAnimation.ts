import { useEffect, useRef, useState } from "react";

interface UseTypingAnimationArgs {
  enabled: boolean;
  text: string;
}

export function useTypingAnimation({ enabled, text }: UseTypingAnimationArgs) {
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

  return {
    isAnimating,
    sourceText,
    dismiss: () => setDismissed(true),
  };
}
