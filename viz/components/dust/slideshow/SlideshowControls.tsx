import { FullscreenButton } from "@viz/components/dust/slideshow/FullscreenButton";
import {
  SLIDESHOW_BUTTON_CLASS_NAME,
  SLIDESHOW_ICON_CLASS_NAME,
  SLIDESHOW_SURFACE_CLASS_NAME,
} from "@viz/components/dust/slideshow/styles";
import { Button } from "@viz/components/ui/button";
import { cn } from "@viz/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { RefObject } from "react";

interface SlideshowControlsProps {
  activeIndex: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  slideshowRef?: RefObject<HTMLElement>;
}

export function SlideshowControls({
  activeIndex,
  total,
  onPrevious,
  onNext,
  slideshowRef,
}: SlideshowControlsProps) {
  return (
    <div
      role="group"
      aria-label="Slideshow controls"
      className={cn(
        "inline-flex items-center gap-2 overflow-hidden rounded-full px-1.5",
        SLIDESHOW_SURFACE_CLASS_NAME
      )}
      style={{ fontFamily: "var(--font-geist), sans-serif" }}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={SLIDESHOW_BUTTON_CLASS_NAME}
        aria-label="Previous slide"
        title="Previous slide (←)"
        disabled={activeIndex === 0}
        onClick={onPrevious}
      >
        <ChevronLeft className={SLIDESHOW_ICON_CLASS_NAME} aria-hidden="true" />
      </Button>
      <span
        className="flex items-center gap-2 whitespace-nowrap text-xs font-medium leading-4 tabular-nums text-muted-foreground"
        aria-live="polite"
        aria-atomic="true"
        aria-label={`Slide ${activeIndex + 1} of ${total}`}
      >
        <span className="text-foreground">{activeIndex + 1}</span>
        <span aria-hidden="true">/</span>
        <span>{total}</span>
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={SLIDESHOW_BUTTON_CLASS_NAME}
        aria-label="Next slide"
        title="Next slide (→)"
        disabled={activeIndex === total - 1}
        onClick={onNext}
      >
        <ChevronRight
          className={SLIDESHOW_ICON_CLASS_NAME}
          aria-hidden="true"
        />
      </Button>
      {slideshowRef && (
        <>
          <span className="h-6 w-px shrink-0 bg-border" aria-hidden="true" />
          <FullscreenButton containerRef={slideshowRef} />
        </>
      )}
    </div>
  );
}
