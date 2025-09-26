import React from "react";

import type { BlockStreamerProps } from "./types";

/**
 * BlockStreamer component handles the token-based streaming animation.
 * It tracks new content as discrete diffs that animate independently.
 */
export const BlockStreamer: React.FC<BlockStreamerProps> = ({
  text,
  animate = true,
  animationName,
  animationDuration,
  animationTimingFunction,
}) => {
  const prevRef = React.useRef<string>("");
  const tokensRef = React.useRef<{ text: string; key: number }[]>([]);

  // Keep tokens up to date so initial render is visible.
  const prev = prevRef.current;
  if (!prev || text.length < prev.length || !text.startsWith(prev)) {
    tokensRef.current = text ? [{ text, key: 0 }] : [];
    prevRef.current = text;
  } else if (text !== prev) {
    const suffix = text.slice(prev.length);
    if (suffix.length > 0) {
      tokensRef.current.push({
        text: suffix,
        key: tokensRef.current.length,
      });
      prevRef.current = text;
    }
  }

  return (
    <>
      {tokensRef.current.map((t) => (
        <span
          key={t.key}
          style={
            animate
              ? {
                  whiteSpace: "pre-wrap",
                  display: "inline",
                  animationName,
                  animationDuration,
                  animationTimingFunction,
                  animationIterationCount: 1,
                }
              : {
                  whiteSpace: "pre-wrap",
                  display: "inline",
                }
          }
        >
          {t.text}
        </span>
      ))}
    </>
  );
};
