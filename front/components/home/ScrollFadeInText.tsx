import React, { useCallback, useEffect, useRef, useState } from "react";
import { useInView } from "react-intersection-observer";

import { classNames as cn } from "@app/lib/utils";

interface ScrollFadeInTextProps {
  text: string;
  className?: string;
  startColor?: string;
  endColor?: string;
  threshold?: number;
  rootMargin?: string;
  mode?: "word" | "character";
  staggerDelay?: number;
}

type TransitionProps = Omit<ScrollFadeInTextProps, "mode">;

const WordByWordTransition = ({
  text,
  className = "",
  startColor = "text-gray-300",
  endColor = "text-gray-900",
  threshold = 0.1,
  rootMargin = "-100px 0px",
  staggerDelay = 50,
}: TransitionProps) => {
  const words = text.split(" ");
  const [visibleIndices, setVisibleIndices] = useState<Set<number>>(new Set());
  const timersRef = useRef<NodeJS.Timeout[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  const { ref: inViewRef, inView } = useInView({
    threshold,
    rootMargin,
    triggerOnce: false,
  });

  const resetAnimation = useCallback(() => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
    setVisibleIndices(new Set());
  }, []);

  useEffect(() => {
    if (!inView) {
      resetAnimation();
      return;
    }

    const newTimers: NodeJS.Timeout[] = [];
    words.forEach((_, index) => {
      const timer = setTimeout(() => {
        setVisibleIndices((prev) => new Set([...prev, index]));
      }, index * staggerDelay);
      newTimers.push(timer);
    });

    timersRef.current = newTimers;

    return () => {
      newTimers.forEach(clearTimeout);
    };
  }, [inView, staggerDelay, resetAnimation, words]);

  return (
    <div ref={containerRef} className={className}>
      <div
        ref={inViewRef}
        className="pointer-events-none absolute left-0 top-0 h-12 w-full -translate-y-24"
      />
      {words.map((word, index) => (
        <span
          key={`${word}-${index}`}
          className={cn(
            "transition-colors duration-700",
            visibleIndices.has(index) ? endColor : startColor
          )}
        >
          {word}
          {index < words.length - 1 ? " " : ""}
        </span>
      ))}
    </div>
  );
};

const CharByCharTransition = ({
  text,
  className = "",
  startColor = "text-gray-300",
  endColor = "text-gray-900",
  threshold = 0.1,
  rootMargin = "-100px 0px",
  staggerDelay = 50,
}: TransitionProps) => {
  const chars = text.split("");
  const { ref: inViewRef, inView } = useInView({
    threshold,
    rootMargin,
    triggerOnce: false,
  });

  return (
    <div className={className}>
      <div
        ref={inViewRef}
        className="pointer-events-none absolute left-0 top-0 h-12 w-full -translate-y-24"
      />
      {chars.map((char, index) => (
        <span
          key={`${char}-${index}`}
          className={cn(
            "inline-block transition-colors duration-700",
            inView ? endColor : startColor
          )}
          style={{
            transitionDelay: `${Math.min(index * staggerDelay, 3000)}ms`,
          }}
        >
          {char === " " ? "\u00A0" : char}
        </span>
      ))}
    </div>
  );
};

export const ScrollFadeInText = ({
  mode = "word",
  ...props
}: ScrollFadeInTextProps) => {
  const Component =
    mode === "word" ? WordByWordTransition : CharByCharTransition;
  return <Component {...props} />;
};

ScrollFadeInText.displayName = "ScrollFadeInText";
