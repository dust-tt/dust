import { FullscreenButton } from "@viz/components/dust/slideshow/FullscreenButton";
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

const BUTTON_CLASS_NAME =
  "h-10 w-10 rounded-2xl px-2.5 py-2 text-muted-foreground hover:bg-black/5 hover:text-foreground dark:hover:bg-white/10";
const ICON_CLASS_NAME =
  "size-5 drop-shadow-[0_0.75px_1.125px_rgba(0,0,0,0.08)]";

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
        "bg-gradient-to-b from-white to-[oklch(98.6%_0.002_67.802)]",
        "shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_1px_1px_-0.5px_rgba(0,0,0,0.06),0_3px_3px_-1.5px_rgba(0,0,0,0.06)]",
        "dark:from-[oklch(34.6%_0.009_80.674)] dark:to-[oklch(25.6%_0.006_34.298)]",
        "dark:shadow-[0_0_0_1px_rgba(0,0,0,0.12),0_1px_1px_-0.5px_rgba(0,0,0,0.18),0_3px_3px_-1.5px_rgba(0,0,0,0.18),inset_0_1px_0_0_rgba(255,255,255,0.02),inset_0_0_0_1px_rgba(255,255,255,0.02)]",
        // Keep the mock's Stone palette local to the controls so frame themes stay intact.
        "[--foreground:oklch(20.6%_0.005_67.543)] [--muted-foreground:oklch(44.4%_0.011_78.213)] [--border:oklch(94.9%_0.003_106.45)]",
        "dark:[--foreground:oklch(92.3%_0.003_48.717)] dark:[--muted-foreground:oklch(70.9%_0.01_62.526)] dark:[--border:oklch(37.4%_0.01_73.594)]"
      )}
      style={{ fontFamily: "var(--font-geist), sans-serif" }}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={BUTTON_CLASS_NAME}
        aria-label="Previous slide"
        title="Previous slide (←)"
        disabled={activeIndex === 0}
        onClick={onPrevious}
      >
        <ChevronLeft className={ICON_CLASS_NAME} aria-hidden="true" />
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
        className={BUTTON_CLASS_NAME}
        aria-label="Next slide"
        title="Next slide (→)"
        disabled={activeIndex === total - 1}
        onClick={onNext}
      >
        <ChevronRight className={ICON_CLASS_NAME} aria-hidden="true" />
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
