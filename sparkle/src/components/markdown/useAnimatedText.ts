import { animate } from "framer-motion";
import { useEffect, useState } from "react";

const delimiter = /(?=[\s\S])/;

export function useAnimatedText(text: string, shouldAnimate: boolean) {
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
        duration: 4,
        ease: "easeOut",
        onUpdate(latest) {
          setCursor(Math.floor(latest));
        },
      });

      return () => controls.stop();
    }
  }, [startingCursor, text, shouldAnimate]);

  if (!shouldAnimate) {
    return text;
  }

  return text.split(delimiter).slice(0, cursor).join("");
}
