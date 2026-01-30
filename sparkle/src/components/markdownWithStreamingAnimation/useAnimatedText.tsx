import { animate } from "framer-motion";
import { useEffect, useRef, useState } from "react";

export type StreamingState = "streaming" | "ended" | "cancelled";


export function useAnimatedText(
  text: string,
  streamingState: StreamingState,
  animationDuration: number,
  delimiter: string,
) {
  const [cursor, setCursor] = useState(0);
  const [startingCursor, setStartingCursor] = useState(0);
  const [prevText, setPrevText] = useState(text);
  const [animationDone, setAnimationDone] = useState(true);

  const controlsRef = useRef<ReturnType<typeof animate> | null>(null);
  const streamingStateRef = useRef(streamingState);
  streamingStateRef.current = streamingState;

  if (prevText !== text) {
    setPrevText(text);
    setStartingCursor(cursor);
  }

  useEffect(() => {
    if (streamingState === "streaming") {
      setAnimationDone(false);
      const textParts = text.split(delimiter);

      controlsRef.current = animate(startingCursor, textParts.length, {
        duration: animationDuration,
        ease: "easeOut",
        onUpdate(latest: number) {
          setCursor(Math.floor(latest));
        },
        onComplete() {
          setAnimationDone(true);
          controlsRef.current = null;
        },
      });
    }

    return () => {
      // Stop animation if:
      // - Still streaming (text changed, need to restart)
      // - Cancelled (user stopped generation, stop immediately)
      // Don't stop if "ended" - let animation finish naturally
      if (
        streamingStateRef.current === "streaming" ||
        streamingStateRef.current === "cancelled"
      ) {
        controlsRef.current?.stop();
      }
    };
  }, [startingCursor, text, streamingState, delimiter, animationDuration]);

  // Return full text immediately if cancelled
  // Return full text if ended and animation is done
  if (
    streamingState === "cancelled" ||
    (streamingState === "ended" && animationDone)
  ) {
    return text;
  }

  return text.split(delimiter).slice(0, cursor).join(delimiter);
}
