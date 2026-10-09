import { cn } from "@dust-tt/sparkle";
import { useReducedMotion } from "framer-motion";
import type { CSSProperties } from "react";
import { useLayoutEffect, useRef, useState } from "react";

const SCROLL_SPEED_PX_PER_SECOND = 50;

interface HoverScrollStyle extends CSSProperties {
  "--scroll-distance": string;
  "--scroll-duration": string;
}

function hoverScrollStyle(overflowPx: number): HoverScrollStyle {
  return {
    "--scroll-distance": `${overflowPx}px`,
    "--scroll-duration": `${(overflowPx / SCROLL_SPEED_PX_PER_SECOND) * 1000}ms`,
  };
}

interface HoverScrollTextProps {
  className?: string;
  text: string;
}

/**
 * @cc [owner:adrsimon,label:react;product] scrolls-only-when-truncated
 * The text MUST scroll only while an ancestor `group` is hovered and the text overflows its box;
 * otherwise, and under reduced motion, it MUST render as a plain ellipsis-truncated line.
 */
export function HoverScrollText({ className, text }: HoverScrollTextProps) {
  const shouldReduceMotion = useReducedMotion();
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflowPx, setOverflowPx] = useState(0);

  useLayoutEffect(() => {
    const element = textRef.current;
    if (!element) {
      return;
    }

    const measure = () =>
      setOverflowPx(element.scrollWidth - element.clientWidth);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => observer.disconnect();
  }, [text]);

  const canScroll = overflowPx > 0 && !shouldReduceMotion;

  return (
    <span className={cn("block min-w-0 overflow-hidden", className)}>
      <span
        ref={textRef}
        className={cn(
          "block truncate",
          canScroll &&
            cn(
              "transition-transform duration-200 ease-out-cubic",
              "group-hover:overflow-visible group-hover:text-clip",
              "group-hover:translate-x-[calc(var(--scroll-distance)*-1)]",
              "group-hover:delay-300 group-hover:duration-(--scroll-duration) group-hover:ease-linear"
            )
        )}
        style={canScroll ? hoverScrollStyle(overflowPx) : undefined}
      >
        {text}
      </span>
    </span>
  );
}
