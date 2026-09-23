"use client";

import { VisualizationThemeRoot } from "@viz/app/components/VisualizationThemeRoot";
import { useVizContext } from "@viz/app/components/VizContext";
import type { FrameTheme } from "@viz/components/dust/frame";
import { SlideshowControls } from "@viz/components/dust/slideshow/SlideshowControls";
import { SlideshowGrid } from "@viz/components/dust/slideshow/SlideshowGrid";
import { cn } from "@viz/lib/utils";
import React, { useCallback, useEffect, useRef, useState } from "react";

interface SlideProps {
  children: React.ReactNode;
  className?: string;
}

export function Slide({ children, className }: SlideProps) {
  return (
    <div
      className={cn(
        // relative keeps absolutely positioned content scoped to its slide during PDF export.
        // [&>*]:min-h-0 overrides the default flex-item `min-height: auto` so  that LLM-generated
        // children with tall intrinsic heights (e.g. an SVG with height="2147") shrink to fit the
        // slide instead of overflowing.
        "relative w-full h-full flex flex-col items-center justify-center overflow-hidden p-4 [&>*]:min-h-0",
        className
      )}
    >
      {children}
    </div>
  );
}

const NAVIGATION_HIDE_DELAY_MS = 3_000;

interface NavigationProps {
  slideshowRef: React.RefObject<HTMLElement>;
  activeIndex: number;
  onNext: () => void;
  onPrev: () => void;
  total: number;
}

function Navigation({
  slideshowRef,
  activeIndex,
  onNext,
  onPrev,
  total,
}: NavigationProps) {
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
    /**
     * @cc [owner:spolu,label:product] keyboard-navigation
     * ArrowLeft, ArrowUp, and PageUp MUST invoke the previous-slide action. ArrowRight, ArrowDown,
     * and PageDown MUST invoke the next-slide action. Other keys MUST NOT trigger slide navigation.
     */
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp") {
        onPrev();
      } else if (
        e.key === "ArrowRight" ||
        e.key === "ArrowDown" ||
        e.key === "PageDown"
      ) {
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
        "absolute bottom-6 left-1/2 -translate-x-1/2 transition-opacity duration-300 focus-within:opacity-100 focus-within:pointer-events-auto [@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto",
        isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
      )}
    >
      <SlideshowControls
        activeIndex={activeIndex}
        total={total}
        onPrevious={onPrev}
        onNext={onNext}
        slideshowRef={slideshowRef}
      />
    </div>
  );
}

interface SlideshowProps {
  children: React.ReactNode;
  className?: string;
  theme?: FrameTheme;
}

/**
 * @cc [owner:flvndvd,label:product] slideshow-theme-scope
 * A theme MUST apply to the existing slideshow root in interactive and PDF modes.
 * Applying a theme MUST NOT add a wrapper or change the slideshow bounds.
 * Omitting the theme MUST preserve the existing appearance.
 */
export function Slideshow({ children, className, theme }: SlideshowProps) {
  const { isPdfMode } = useVizContext();
  const slides = React.Children.toArray(children);

  return (
    <VisualizationThemeRoot hasTheme={theme !== undefined}>
      {isPdfMode ? (
        <PdfSlideshow className={className} theme={theme}>
          {slides}
        </PdfSlideshow>
      ) : (
        <InteractiveSlideshow className={className} theme={theme}>
          {slides}
        </InteractiveSlideshow>
      )}
    </VisualizationThemeRoot>
  );
}

// PDF mode: all slides stacked with page breaks

interface SlideshowContentProps extends SlideshowProps {
  children: React.ReactNode[];
}

function PdfSlideshow({ children, className, theme }: SlideshowContentProps) {
  return (
    <div
      className={cn(
        "w-full",
        theme && "bg-background font-sans text-foreground",
        className
      )}
      style={theme}
    >
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

function InteractiveSlideshow({
  children,
  className,
  theme,
}: SlideshowContentProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const slideshowRef = useRef<HTMLDivElement>(null);

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
      ref={slideshowRef}
      className={cn(
        "relative h-screen w-full overflow-hidden [&:fullscreen]:bg-background",
        theme && "bg-background font-sans text-foreground",
        className
      )}
      style={theme}
      aria-label="Slideshow"
    >
      {children[activeIndex]}
      <SlideshowGrid
        slides={children}
        activeIndex={activeIndex}
        onSlideSelect={setActiveIndex}
        slideshowRef={slideshowRef}
      />
      <Navigation
        activeIndex={activeIndex}
        onNext={onNext}
        onPrev={onPrev}
        total={children.length}
        slideshowRef={slideshowRef}
      />
    </div>
  );
}
