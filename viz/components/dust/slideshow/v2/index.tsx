"use client";

import { useVizContext } from "@viz/app/components/VizContext";
import { cn } from "@viz/lib/utils";
import { ArrowLeftIcon } from "@viz/components/dust/slideshow/v2/icons/ArrowLeftIcon";
import { ArrowRightIcon } from "@viz/components/dust/slideshow/v2/icons/ArrowRightIcon";
import React, { useCallback, useEffect, useRef, useState } from "react";

interface SlideProps {
  children: React.ReactNode;
  className?: string;
}

export function Slide({ children, className }: SlideProps) {
  return (
    <div
      className={cn(
        // [&>*]:min-h-0 overrides the default flex-item `min-height: auto` so  that LLM-generated
        // children with tall intrinsic heights (e.g. an SVG with height="2147") shrink to fit the
        // slide instead of overflowing.
        "w-full h-full flex flex-col items-center justify-center overflow-hidden p-4 [&>*]:min-h-0",
        className
      )}
    >
      {children}
    </div>
  );
}

const NAVIGATION_HIDE_DELAY_MS = 3_000;

interface NavigationProps {
  activeIndex: number;
  onNext: () => void;
  onPrev: () => void;
  total: number;
}

function Navigation({ activeIndex, onNext, onPrev, total }: NavigationProps) {
  const [isVisible, setIsVisible] = useState(true);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Resets the hide timer, making navigation controls visible for a few seconds.
  const resetHideTimer = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
    setIsVisible(true);
    hideTimeoutRef.current = setTimeout(() => {
      setIsVisible(false);
    }, NAVIGATION_HIDE_DELAY_MS);
  }, []);

  useEffect(() => {
    resetHideTimer();
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, [resetHideTimer]);

  useEffect(() => {
    resetHideTimer();
  }, [activeIndex, resetHideTimer]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        onPrev();
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        onNext();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onPrev, onNext]);

  useEffect(() => {
    const handleMouseMove = () => {
      resetHideTimer();
    };
    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, [resetHideTimer]);

  return (
    <div
      className={cn(
        "absolute bottom-6 left-1/2 -translate-x-1/2 transition-opacity duration-300",
        isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
      )}
    >
      <div
        className={cn(
          "box-content w-36 h-7 inline-flex justify-between items-center overflow-hidden rounded-2xl bg-card",
          "p-1.5 border border-border-bottom border-gray-100"
        )}
        style={{
          boxShadow:
            "0px 1px 3px 0px rgba(0, 0, 0, 0.1), 0px 1px 1px -1px rgba(0, 0, 0, 0.1)",
        }}
      >
        <button
          onClick={onPrev}
          disabled={activeIndex === 0}
          className="disabled:opacity-40 px-2"
          title="Previous"
          aria-label="Previous slide"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </button>

        <span className="text-center justify-center copy-lg">
          {activeIndex + 1} of {total}
        </span>

        <button
          onClick={onNext}
          disabled={activeIndex === total - 1}
          className="disabled:opacity-40 px-2"
          title="Next"
          aria-label="Next slide"
        >
          <ArrowRightIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

interface SlideshowProps {
  children: React.ReactNode;
  className?: string;
}

export function Slideshow({ children, className }: SlideshowProps) {
  const { isPdfMode } = useVizContext();
  const slides = React.Children.toArray(children);

  if (isPdfMode) {
    return <PdfSlideshow className={className}>{slides}</PdfSlideshow>;
  }

  return (
    <InteractiveSlideshow className={className}>{slides}</InteractiveSlideshow>
  );
}

// PDF mode: all slides stacked with page breaks

interface PdfSlideshowProps {
  children: React.ReactNode[];
  className?: string;
}

function PdfSlideshow({ children, className }: PdfSlideshowProps) {
  return (
    <div className={cn("w-full", className)}>
      {children.map((slide, i) => (
        <div
          key={i}
          className="min-h-screen h-screen"
          style={{ breakAfter: i < children.length - 1 ? "page" : "auto" }}
        >
          {slide}
        </div>
      ))}
    </div>
  );
}

// Interactive mode: one slide at a time with navigation

interface InteractiveSlideshowProps {
  children: React.ReactNode[];
  className?: string;
}

function InteractiveSlideshow({
  children,
  className,
}: InteractiveSlideshowProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  const onPrev = useCallback(() => {
    setActiveIndex((i) => Math.max(i - 1, 0));
  }, []);

  const onNext = useCallback(() => {
    setActiveIndex((i) => Math.min(i + 1, children.length - 1));
  }, [children.length]);

  if (children.length === 0) {
    return null;
  }

  return (
    <div
      className={cn("relative h-screen w-full overflow-hidden", className)}
      aria-label="Slideshow"
    >
      {children[activeIndex]}
      {children.length > 1 && (
        <Navigation
          activeIndex={activeIndex}
          onNext={onNext}
          onPrev={onPrev}
          total={children.length}
        />
      )}
    </div>
  );
}
