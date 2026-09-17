import { SlideshowControls } from "@viz/components/dust/slideshow/SlideshowControls";
import { cn } from "@viz/lib/utils";
import React from "react";

interface SlideshowNavigationProps {
  slideshowRef?: React.RefObject<HTMLElement>;
  index: number;
  isVisible: boolean;
  next: () => void;
  prev: () => void;
  total: number;
}

export function SlideshowNavigation({
  slideshowRef,
  index,
  isVisible,
  next,
  prev,
  total,
}: SlideshowNavigationProps) {
  React.useEffect(() => {
    /**
     * @cc [owner:spolu,label:product] keyboard-navigation
     * ArrowLeft, ArrowUp, and PageUp MUST invoke the previous-slide action. ArrowRight, ArrowDown,
     * and PageDown MUST invoke the next-slide action. Other keys MUST NOT trigger slide navigation.
     */
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp") {
        prev();
      } else if (
        e.key === "ArrowRight" ||
        e.key === "ArrowDown" ||
        e.key === "PageDown"
      ) {
        next();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [prev, next]);

  return (
    <div
      className={cn(
        "absolute bottom-6 left-1/2 -translate-x-1/2 transition-opacity duration-300 focus-within:opacity-100 focus-within:pointer-events-auto",
        isVisible ? "opacity-100" : "opacity-0 pointer-events-none",
        // Always visible on touch devices (no hover available)
        "[@media(hover:none)]:opacity-100 [@media(hover:none)]:pointer-events-auto"
      )}
    >
      <SlideshowControls
        activeIndex={index}
        total={total}
        onPrevious={prev}
        onNext={next}
        slideshowRef={slideshowRef}
      />
    </div>
  );
}
