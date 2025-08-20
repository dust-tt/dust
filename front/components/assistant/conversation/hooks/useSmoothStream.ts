import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Smoothly reveals text when `isStreaming` is true.
 * - If streaming: progressively reveals characters with a small cadence.
 * - If not streaming: returns full text immediately and resets internal state.
 *
 * The effect is lightweight and avoids re-render storms by batching updates
 * roughly every frame using `requestAnimationFrame` and a small step size.
 */
export function useSmoothStream(
  text: string,
  isStreaming: boolean,
  options?: {
    /** granularity of reveal */
    granularity?: "char" | "word";
    /** chars per tick if granularity is char */
    stepChars?: number;
    /** words per tick if granularity is word */
    stepWords?: number;
    /** minimum delay in ms between batches when streaming */
    minDelayMs?: number;
    /** adaptive fraction for chars (0 disables adaptive) */
    adaptiveFactorChars?: number;
    /** adaptive fraction for words (0 disables adaptive) */
    adaptiveFactorWords?: number;
  }
) {
  const granularity = options?.granularity ?? "word";
  const stepChars = options?.stepChars ?? 3;
  const stepWords = options?.stepWords ?? 1;
  const minDelayMs = options?.minDelayMs ?? 80; // smoother pace
  const adaptiveFactorChars = options?.adaptiveFactorChars ?? 0.003;
  const adaptiveFactorWords = options?.adaptiveFactorWords ?? 0.01;

  // Compute token boundaries for word granularity: sequence of end indices for word+space tokens.
  const wordBoundaries = useMemo(() => {
    if (granularity !== "word") {
      return [];
    }
    const indices: number[] = [];
    let idx = 0;
    const re = /\S+\s*/g; // word plus following spaces
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      idx = m.index + m[0].length;
      indices.push(idx);
    }
    // If text doesn't end with whitespace, ensure final boundary is text.length
    if (indices.length === 0 || indices[indices.length - 1] < text.length) {
      indices.push(text.length);
    }
    return indices;
  }, [text, granularity]);

  // Progress state: either character count or word-token count, depending on granularity.
  const [progress, setProgress] = useState<number>(isStreaming ? 0 : Infinity);
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);

  // Clamp progress when input changes; snap to full when not streaming.
  useEffect(() => {
    if (!isStreaming) {
      setProgress(Infinity);
      return;
    }
    setProgress((p) => {
      if (granularity === "word") {
        return Math.min(p, wordBoundaries.length);
      } else {
        return Math.min(p, text.length);
      }
    });
  }, [isStreaming, text.length, wordBoundaries.length, granularity]);

  useEffect(() => {
    if (!isStreaming) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = null;
      return;
    }

    const tick = (now: number) => {
      if (now - lastTickRef.current >= minDelayMs) {
        lastTickRef.current = now;
        setProgress((p) => {
          if (granularity === "word") {
            const total = wordBoundaries.length;
            if (p >= total) {
              return p;
            }
            // adaptive words per tick for long content (can be disabled via factor=0)
            const adaptiveFromTotal = Math.floor(total * adaptiveFactorWords);
            const next = Math.max(stepWords, adaptiveFromTotal);
            return Math.min(total, p + next);
          } else {
            const total = text.length;
            if (p >= total) {
              return p;
            }
            const adaptiveFromTotal = Math.floor(total * adaptiveFactorChars);
            const next = Math.max(stepChars, adaptiveFromTotal);
            return Math.min(total, p + next);
          }
        });
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = null;
    };
  }, [
    isStreaming,
    wordBoundaries.length,
    text.length,
    granularity,
    stepChars,
    stepWords,
    minDelayMs,
    adaptiveFactorWords,
    adaptiveFactorChars,
  ]);

  const displayed = useMemo(() => {
    if (!isStreaming) {
      return text;
    }
    if (granularity === "word") {
      const tokenIndex = Math.min(progress, wordBoundaries.length);
      const cut =
        tokenIndex >= wordBoundaries.length
          ? text.length
          : wordBoundaries[tokenIndex - 1] ?? 0;
      return text.slice(0, cut);
    } else {
      const cut = Math.min(progress, text.length);
      return text.slice(0, cut);
    }
  }, [text, isStreaming, progress, granularity, wordBoundaries]);

  const isComplete = !isStreaming || displayed.length >= text.length;

  return { displayed, isComplete } as const;
}
