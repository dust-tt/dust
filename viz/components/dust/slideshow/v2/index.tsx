"use client";

import { useVizContext } from "@viz/app/components/VizContext";
import { cn } from "@viz/lib/utils";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import React, { useCallback, useEffect, useRef, useState } from "react";

// -- Slide --

interface SlideProps {
  children: React.ReactNode;
  className?: string;
}

export function Slide({ children, className }: SlideProps) {
  return (
    <div
      className={cn(
        "w-full h-full min-h-screen flex flex-col items-center justify-center overflow-hidden p-12",
        className
      )}
    >
      {children}
    </div>
  );
}

// -- Navigation --

const NAVIGATION_HIDE_DELAY_MS = 3000;

interface NavigationProps {
  activeIndex: number;
  onNext: () => void;
  onPrev: () => void;
  total: number;
}

function Navigation({ activeIndex, onNext, onPrev, total }: NavigationProps) {
  const [isVisible, setIsVisible] = useState(true);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

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

  return (
    <>
      {/* Prev / Next arrow buttons */}
      <button
        onClick={onPrev}
        disabled={activeIndex === 0}
        className={cn(
          "absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 shadow border border-gray-200 transition-opacity duration-300",
          "disabled:opacity-0",
          isVisible
            ? "opacity-70 hover:opacity-100"
            : "opacity-0 pointer-events-none"
        )}
        aria-label="Previous slide"
      >
        <ChevronLeftIcon className="h-6 w-6" />
      </button>
      <button
        onClick={onNext}
        disabled={activeIndex === total - 1}
        className={cn(
          "absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 shadow border border-gray-200 transition-opacity duration-300",
          "disabled:opacity-0",
          isVisible
            ? "opacity-70 hover:opacity-100"
            : "opacity-0 pointer-events-none"
        )}
        aria-label="Next slide"
      >
        <ChevronRightIcon className="h-6 w-6" />
      </button>

      {/* Dot indicators */}
      <div
        className={cn(
          "absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 transition-opacity duration-300",
          isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
        )}
      >
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className={cn(
              "w-2.5 h-2.5 rounded-full transition-colors",
              i === activeIndex ? "bg-gray-800" : "bg-gray-300"
            )}
          />
        ))}
      </div>
    </>
  );
}

// -- Slideshow --

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

// -- PDF mode: all slides stacked with page breaks --

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
          style={{ breakAfter: i < children.length - 1 ? "page" : "auto" }}
        >
          {slide}
        </div>
      ))}
    </div>
  );
}

// -- Interactive mode: one slide at a time with navigation --

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
      role="region"
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
