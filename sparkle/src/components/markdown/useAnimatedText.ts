import { animate, type Easing } from "framer-motion";
import { useEffect, useState } from "react";

export function useAnimatedText(
  text: string,
  shouldAnimate: boolean,
  options?: {
    duration?: number;
    ease?: Easing;
  }
) {
  const [cursor, setCursor] = useState(0);
  const [startingCursor, setStartingCursor] = useState(0);
  const [prevText, setPrevText] = useState(text);

  if (prevText !== text) {
    setPrevText(text);
    setStartingCursor(text.startsWith(prevText) ? cursor : 0);
  }

  useEffect(() => {
    const controls = animate(startingCursor, text.length, {
      duration: options?.duration ?? 4,
      ease: options?.ease ?? "easeOut",
      onUpdate(latest) {
        setCursor(Math.floor(latest));
      },
    });

    return () => controls.stop();
  }, [startingCursor, text, options?.duration, options?.ease]);

  if (!shouldAnimate) {
    return text;
  }

  return text.slice(0, cursor);
}
