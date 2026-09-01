import { animate } from "framer-motion";
import { useEffect, useRef, useState } from "react";

export type StreamingState = "streaming" | "none" | "cancelled";

/**
 * Smallest gap between two cursor commits. `animate` ticks on every animation
 * frame — 120 times a second on a modern display — and each commit re-renders
 * the whole markdown tree, all while the main thread is already busy parsing
 * the stream. Text appearing in ~30 steps a second is past what reading can
 * resolve, so the extra commits bought nothing.
 */
const CURSOR_COMMIT_INTERVAL_MS = 32;

/**
 * Provides a progressively revealed version of `text` while `streamingState`
 * is "streaming", animating a cursor over `delimiter`-separated parts for a
 * smooth reveal; returns the full text once streaming ends or is cancelled.
 * Used by Markdown when `enableAnimation` is set.
 * @summary Hook animating streamed text reveal.
 */
export function useAnimatedText(
  text: string,
  streamingState: StreamingState,
  animationDurationSeconds: number,
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
      // When streaming ended before this effect ran (e.g. the last text chunk
      // arrived at the same time as streamingState transitioned to "none"),
      // ensure we show the full text instead of getting stuck on a truncated
      // cursor position.
      if (streamingStateRef.current === "none") {
        setDisableAnimation(true);
      }
      return;
    }

    setDisableAnimation(false);
    const textParts = text.split(delimiter);

    // Animates from startingCursor to textParts.length over animationDurationSeconds seconds.
    // Each time new text arrives, the animation restarts from the current cursor.
    // The duration is fixed, so the reveal speed depends on the gap (target - cursor):
    //   - First chunk: small gap (e.g. 29 chars / 1s = ~29 chars/sec) → feels slow/throttled.
    //   - Later chunks: larger gap (e.g. 131 chars / 1s = ~131 chars/sec) → feels smooth
    //     because more chars are crammed into the same duration.
    let lastCommittedCursor = startingCursor;
    let lastCommitAtMs = 0;

    controlsRef.current = animate(startingCursor, textParts.length, {
      duration: animationDurationSeconds,
      ease: "easeOut",
      // latest is the interpolated cursor position (number of visible characters).
      onUpdate(latest: number) {
        const next = Math.floor(latest);
        if (next === lastCommittedCursor) {
          return;
        }
        const nowMs = performance.now();
        if (nowMs - lastCommitAtMs < CURSOR_COMMIT_INTERVAL_MS) {
          return;
        }
        lastCommitAtMs = nowMs;
        lastCommittedCursor = next;
        setCursor(next);
      },
      onComplete() {
        // Always land on the target: throttling can drop the final onUpdate,
        // which would leave the reveal short until the next chunk arrives.
        setCursor(textParts.length);
        setDisableAnimation(true);
        controlsRef.current = null;
      },
    });

    return () => {
      controlsRef.current?.stop();
    };
  }, [startingCursor, text, delimiter, animationDurationSeconds]);

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
