import { animate } from "framer-motion";
import { useEffect, useRef, useState } from "react";

export type StreamingState = "streaming" | "none" | "cancelled";

export function useAnimatedText(
  text: string,
  streamingState: StreamingState,
  animationDuration: number,
  delimiter: string
) {
  const [cursor, setCursor] = useState(0);
  const [startingCursor, setStartingCursor] = useState(0);
  const [prevText, setPrevText] = useState(text);
  const [animationDone, setAnimationDone] = useState(true);

  const controlsRef = useRef<ReturnType<typeof animate> | null>(null);
  const streamingStateRef = useRef(streamingState);
  const hasMultipleChunksRef = useRef(false);
  streamingStateRef.current = streamingState;

  if (prevText !== text) {
    setPrevText(text);
    setStartingCursor(cursor);
    if (streamingStateRef.current === "streaming" && startingCursor > 0) {
      hasMultipleChunksRef.current = true;
    }
  }

  useEffect(() => {
    if (streamingStateRef.current !== "streaming") {
      return;
    }

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

    return () => {
      controlsRef.current?.stop();
    };
  }, [startingCursor, text, delimiter, animationDuration]);

  useEffect(() => {
    if (streamingState === "cancelled") {
      controlsRef.current?.stop();
      controlsRef.current = null;
    }
    if (streamingState === "none" && !hasMultipleChunksRef.current) {
      // Text arrived in a single chunk — skip animation.
      controlsRef.current?.stop();
      controlsRef.current = null;
      setAnimationDone(true);
    }
    if (streamingState === "streaming") {
      hasMultipleChunksRef.current = false;
    }
  }, [streamingState]);

  // Return full text immediately if cancelled
  // Return full text if ended and animation is done
  if (
    streamingState === "cancelled" ||
    (streamingState === "none" && animationDone)
  ) {
    return text;
  }

  return text.split(delimiter).slice(0, cursor).join(delimiter);
}
