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
  const [disableAnimation, setDisableAnimation] = useState(true);

  const controlsRef = useRef<ReturnType<typeof animate> | null>(null);
  const streamingStateRef = useRef(streamingState);
  streamingStateRef.current = streamingState;

  // if the new chunks of text have arrived, reset the starting cursor to the current cursor
  if (prevText !== text) {
    setPrevText(text);
    setStartingCursor(cursor);
  }

  useEffect(() => {
    if (streamingStateRef.current !== "streaming") {
      return;
    }

    setDisableAnimation(false);
    const textParts = text.split(delimiter);

    // Animates from startingCursor to textParts.length over animationDuration seconds.
    // Each time new text arrives, the animation restarts from the current cursor.
    // The duration is fixed, so the reveal speed depends on the gap (target - cursor):
    //   - First chunk: small gap (e.g. 29 chars / 1s = ~29 chars/sec) → feels slow/throttled.
    //   - Later chunks: larger gap (e.g. 131 chars / 1s = ~131 chars/sec) → feels smooth
    //     because more chars are crammed into the same duration.
    controlsRef.current = animate(startingCursor, textParts.length, {
      duration: animationDuration,
      ease: "easeOut",
      // latest is the interpolated cursor position (number of visible characters).
      onUpdate(latest: number) {
        setCursor(Math.floor(latest));
      },
      onComplete() {
        setDisableAnimation(true);
        controlsRef.current = null;
      },
    });

    return () => {
      controlsRef.current?.stop();
    };
  }, [startingCursor, text, delimiter, animationDuration]);

  useEffect(() => {
    // stop animation if streaming is cancelled.
    if (streamingState === "cancelled") {
      controlsRef.current?.stop();
      controlsRef.current = null;
    }
  }, [streamingState]);

  // Return full text immediately if cancelled or none (and animation is finished if streaming before)
  if (
    streamingState === "cancelled" ||
    (streamingState === "none" && disableAnimation)
  ) {
    return text;
  }

  return text.split(delimiter).slice(0, cursor).join(delimiter);
}
