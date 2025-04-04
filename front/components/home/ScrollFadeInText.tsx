import React, { useEffect, useRef, useState } from "react";
import { useInView } from "react-intersection-observer";

type ScrollFadeInTextProps = {
  text: string;
  className?: string;
  startColor?: string; // TailwindCSS color class for the starting color
  endColor?: string; // TailwindCSS color class for the ending color
  threshold?: number; // Value between 0 and 1
  rootMargin?: string;
  mode?: "word" | "character"; // Animation mode: word-by-word or character-by-character
  staggerDelay?: number; // Delay between each element's animation in milliseconds
};

export const ScrollFadeInText: React.FC<ScrollFadeInTextProps> = ({
  text,
  className = "",
  startColor = "text-gray-300",
  endColor = "text-gray-900",
  threshold = 0.1,
  rootMargin = "-100px 0px",
  mode = "word",
  staggerDelay = 50,
}) => {
  if (mode === "word") {
    return (
      <WordByWordTransition
        text={text}
        className={className}
        startColor={startColor}
        endColor={endColor}
        threshold={threshold}
        rootMargin={rootMargin}
        staggerDelay={staggerDelay}
      />
    );
  } else {
    return (
      <CharByCharTransition
        text={text}
        className={className}
        startColor={startColor}
        endColor={endColor}
        threshold={threshold}
        rootMargin={rootMargin}
        staggerDelay={staggerDelay}
      />
    );
  }
};

// Word-by-word transition component
const WordByWordTransition: React.FC<Omit<ScrollFadeInTextProps, "mode">> = ({
  text,
  className,
  startColor,
  endColor,
  threshold = 0.1,
  rootMargin,
  staggerDelay,
}) => {
  // Split the text into words
  const words = text.split(" ");

  // Create a single IntersectionObserver for the container
  const { ref, inView } = useInView({
    threshold,
    rootMargin,
    triggerOnce: false,
  });

  // Track visible words with local state
  const [visibleIndices, setVisibleIndices] = useState<number[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Effect to handle word visibility based on scroll position
  useEffect(() => {
    if (!inView || !containerRef.current) {
      return;
    }

    // Add words to visible array in sequence with delays
    const wordElements = containerRef.current.querySelectorAll(".word-element");

    // Clear existing timers if any
    const timers: NodeJS.Timeout[] = [];

    wordElements.forEach((_, index) => {
      const timer = setTimeout(() => {
        setVisibleIndices((prev) => [...prev, index]);
      }, index * staggerDelay);
      timers.push(timer);
    });

    // Clear timers on cleanup
    return () => {
      timers.forEach((t) => clearTimeout(t));
      if (!inView) {
        setVisibleIndices([]);
      }
    };
  }, [inView, staggerDelay]);

  return (
    <div ref={containerRef} className={className}>
      <div
        ref={ref}
        className="pointer-events-none absolute left-0 top-0 h-12 w-full -translate-y-24"
      />
      {words.map((word, index) => (
        <span
          key={`${word}-${index}`}
          className={`word-element transition-colors duration-700 ${
            inView && visibleIndices.includes(index) ? endColor : startColor
          }`}
        >
          {word}
          {index < words.length - 1 ? " " : ""}
        </span>
      ))}
    </div>
  );
};

// Character-by-character transition component
const CharByCharTransition: React.FC<Omit<ScrollFadeInTextProps, "mode">> = ({
  text,
  className,
  startColor,
  endColor,
  threshold = 0.1,
  rootMargin,
  staggerDelay,
}) => {
  const chars = text.split("");
  const { ref, inView } = useInView({
    threshold,
    rootMargin,
    triggerOnce: false,
  });

  return (
    <div ref={ref} className={className}>
      {chars.map((char, index) => (
        <span
          key={`${char}-${index}`}
          className={`inline-block transition-colors duration-700 ${
            inView ? endColor : startColor
          }`}
          style={{
            transitionDelay: `${Math.min(index * (staggerDelay || 0), 3000)}ms`,
          }}
        >
          {char === " " ? "\u00A0" : char}
        </span>
      ))}
    </div>
  );
};
