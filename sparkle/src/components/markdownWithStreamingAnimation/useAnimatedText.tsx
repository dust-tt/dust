import { animate } from "framer-motion";
import { useEffect, useState } from "react";

// Regex to split text into individual characters (including newlines)

export interface AnimatedTextConfig {
  delimiter?: RegExp | string;
  duration?: number;
}

export function useAnimatedText(
  text: string,
  shouldAnimate: boolean,
  animationDuration: number,
  delimiter: RegExp | string,
) {
  const [cursor, setCursor] = useState(0);
  const [startingCursor, setStartingCursor] = useState(0);
  const [prevText, setPrevText] = useState(text);

  if (prevText !== text) {
    setPrevText(text);
    setStartingCursor(cursor);
  }

  useEffect(() => {
    if (shouldAnimate) {
      const textParts = text.split(delimiter);
      const controls = animate(startingCursor, textParts.length, {
        duration: animationDuration,
        ease: "easeOut",
        onUpdate(latest: number) {
          setCursor(Math.floor(latest));
        },
      });

      return () => controls.stop();
    }
  }, [startingCursor, text, shouldAnimate, delimiter, animationDuration]);

  if (!shouldAnimate) {
    return text;
  }

  return text.split(delimiter).slice(0, cursor).join("");
}
