import { cn } from "@viz/lib/utils";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import React from "react";

interface SlideshowNavigationProps {
  index: number;
  isVisible: boolean;
  next: () => void;
  prev: () => void;
  total: number;
}

export function SlideshowNavigation({
  index,
  isVisible,
  next,
  prev,
  total,
}: SlideshowNavigationProps) {
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
        prev();
      } else if (e.key === "ArrowRight" || e.key === "ArrowDown") {
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
        "absolute bottom-6 left-1/2 -translate-x-1/2 transition-opacity duration-300",
        isVisible ? "opacity-100" : "opacity-0 pointer-events-none"
      )}
    >
      <div
        className={cn(
          "w-44 inline-flex justify-between items-center overflow-hidden rounded bg-card shadow",
          "py-1.5 px-3 outline outline-1 outline-gray-100 border border-border"
        )}
      >
        <button
          onClick={prev}
          disabled={index === 0}
          className="disabled:opacity-40"
          title="Previous (←)"
          aria-label="Previous slide"
        >
          <ChevronLeftIcon className="h-5 w-5" />
        </button>

        <span className="text-center justify-center text-lg font-medium">
          {index + 1} of {total}
        </span>

        <button
          onClick={next}
          disabled={index === total - 1}
          className="disabled:opacity-40"
          title="Next (→)"
          aria-label="Next slide"
        >
          <ChevronRightIcon className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}
