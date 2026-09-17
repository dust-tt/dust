import { SlideThumbnail } from "@viz/components/dust/slideshow/SlideThumbnail";
import {
  SLIDESHOW_BUTTON_CLASS_NAME,
  SLIDESHOW_ICON_CLASS_NAME,
  SLIDESHOW_SURFACE_CLASS_NAME,
} from "@viz/components/dust/slideshow/styles";
import { Button } from "@viz/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from "@viz/components/ui/drawer";
import { ScrollArea } from "@viz/components/ui/scroll-area";
import { cn } from "@viz/lib/utils";
import { LayoutGrid, X } from "lucide-react";
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from "react";

const GRID_REVEAL_DISTANCE_PX = 80;

interface SlideshowGridProps {
  slides: ReactNode[];
  activeIndex: number;
  onSlideSelect: (index: number) => void;
  slideshowRef: RefObject<HTMLElement>;
}

/**
 * @cc [owner:flvndvd,label:react] presentation-drawer
 * Opening or closing the drawer MUST NOT resize or remount the active slide or
 * reset its state. The drawer MUST retain the primitive's focus and dismissal behavior.
 */
/**
 * @cc [owner:flvndvd,label:product] grid-control-visibility
 * Hover MUST reveal the closed drawer's trigger only near the presentation's left edge.
 * The trigger MUST stay hidden until the drawer finishes closing.
 */
export function SlideshowGrid({
  slides,
  activeIndex,
  onSlideSelect,
  slideshowRef,
}: SlideshowGridProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isNearLeftEdge, setIsNearLeftEdge] = useState(false);

  useEffect(() => {
    const presentation = slideshowRef.current;
    if (!presentation) {
      return;
    }
    const handleMouseMove = (event: MouseEvent) => {
      const distance =
        event.clientX - presentation.getBoundingClientRect().left;
      setIsNearLeftEdge(distance >= 0 && distance <= GRID_REVEAL_DISTANCE_PX);
    };
    const handleMouseLeave = () => setIsNearLeftEdge(false);
    presentation.addEventListener("mousemove", handleMouseMove);
    presentation.addEventListener("mouseleave", handleMouseLeave);
    return () => {
      presentation.removeEventListener("mousemove", handleMouseMove);
      presentation.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [slideshowRef]);

  return (
    <Drawer
      direction="left"
      open={isOpen}
      onOpenChange={(open) => {
        setIsOpen(open);
        setIsClosing(!open);
      }}
      container={slideshowRef.current}
      autoFocus
    >
      <div
        className={cn(
          "pointer-events-none absolute left-4 top-1/2 z-30 -translate-y-1/2 transition-opacity duration-150 ease-out focus-within:opacity-100 focus-within:duration-0 [@media(hover:none)]:opacity-100 motion-reduce:transition-none",
          isNearLeftEdge ? "opacity-100" : "opacity-0",
          (isOpen || isClosing) && "transition-none"
        )}
      >
        <Button
          asChild
          variant="ghost"
          size="icon"
          className={cn(
            SLIDESHOW_BUTTON_CLASS_NAME,
            SLIDESHOW_SURFACE_CLASS_NAME,
            isOpen || isClosing
              ? "pointer-events-none opacity-0"
              : cn(
                  "opacity-100 focus-visible:pointer-events-auto [@media(hover:none)]:pointer-events-auto",
                  isNearLeftEdge ? "pointer-events-auto" : "pointer-events-none"
                )
          )}
        >
          <DrawerTrigger
            aria-label="Show slide previews"
            title="Show slide previews"
            tabIndex={isClosing ? -1 : undefined}
          >
            <LayoutGrid
              className={SLIDESHOW_ICON_CLASS_NAME}
              aria-hidden="true"
            />
          </DrawerTrigger>
        </Button>
      </div>
      <DrawerContent
        overlayClassName="absolute bg-transparent [&[data-vaul-overlay][data-state]]:[animation-duration:250ms] motion-reduce:[&[data-vaul-overlay][data-state]]:animate-none"
        onCloseAutoFocus={() => setIsClosing(false)}
        className="absolute h-full rounded-none bg-white/80 backdrop-blur-xl outline-none data-[vaul-drawer-direction=left]:w-[232px] data-[vaul-drawer-direction=left]:max-w-[calc(100%_-_64px)] data-[vaul-drawer-direction=left]:border-r-0 data-[vaul-drawer-direction=left]:sm:max-w-[232px] dark:bg-[oklch(25.6%_0.006_34.298_/_0.8)] [&[data-vaul-drawer]]:[animation-duration:250ms] [&[data-vaul-drawer]]:duration-[250ms] motion-reduce:[&[data-vaul-drawer]]:animate-none motion-reduce:[&[data-vaul-drawer]]:transition-none"
        onKeyDown={(event) => {
          if (
            [
              "ArrowLeft",
              "ArrowRight",
              "ArrowUp",
              "ArrowDown",
              "PageUp",
              "PageDown",
            ].includes(event.key)
          ) {
            event.preventDefault();
          }
        }}
      >
        <DrawerTitle className="sr-only">Slide previews</DrawerTitle>
        <DrawerDescription className="sr-only">
          Choose a slide to jump to it.
        </DrawerDescription>
        <div
          className={cn(
            "absolute left-[calc(100%+16px)] top-1/2 -translate-y-1/2 rounded-2xl",
            SLIDESHOW_SURFACE_CLASS_NAME
          )}
        >
          <Button
            asChild
            variant="ghost"
            size="icon"
            className={SLIDESHOW_BUTTON_CLASS_NAME}
          >
            <DrawerClose
              aria-label="Close slide previews"
              title="Close slide previews"
            >
              <span className="relative size-5" aria-hidden="true">
                <X
                  className={cn(
                    SLIDESHOW_ICON_CLASS_NAME,
                    "absolute inset-0 transition-opacity duration-150 group-data-[state=closed]/drawer-content:opacity-0 motion-reduce:transition-none"
                  )}
                />
                <LayoutGrid
                  className={cn(
                    SLIDESHOW_ICON_CLASS_NAME,
                    "absolute inset-0 opacity-0 transition-opacity duration-150 group-data-[state=closed]/drawer-content:opacity-100 motion-reduce:transition-none"
                  )}
                />
              </span>
            </DrawerClose>
          </Button>
        </div>
        <SlidePreviewList
          slides={slides}
          activeIndex={activeIndex}
          onSlideSelect={onSlideSelect}
        />
      </DrawerContent>
    </Drawer>
  );
}

/**
 * @cc [owner:flvndvd,label:react] preview-focus-follows-navigation
 * When the active slide changes with focus inside the preview list, focus MUST
 * follow the active preview. Focus elsewhere in the drawer MUST be preserved.
 */
/**
 * @cc [owner:flvndvd,label:product] preview-selection-contrast
 * The selected preview MUST have a contrasting outline separated from the slide
 * content in both light and dark themes.
 */
function SlidePreviewList({
  slides,
  activeIndex,
  onSlideSelect,
}: Omit<SlideshowGridProps, "slideshowRef">) {
  const previewListRef = useRef<HTMLOListElement>(null);
  const activePreviewRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activePreviewRef.current?.scrollIntoView({ block: "nearest" });
    if (previewListRef.current?.contains(document.activeElement)) {
      activePreviewRef.current?.focus({ preventScroll: true });
    }
  }, [activeIndex]);

  return (
    <ScrollArea className="min-h-0 flex-1">
      <ol ref={previewListRef} className="flex flex-col gap-4 px-4 py-6">
        {slides.map((slide, index) => (
          <li
            key={index}
            className="group/preview relative flex items-center gap-2"
          >
            <span
              aria-hidden="true"
              className={cn(
                "w-4 shrink-0 text-right font-sans text-base font-medium leading-6 tabular-nums underline-offset-4 transition-colors group-has-[:focus-visible]/preview:underline",
                index === activeIndex
                  ? "text-stone-900 dark:text-stone-200"
                  : "text-stone-600 group-hover/preview:text-stone-900 dark:text-stone-400 dark:group-hover/preview:text-stone-200"
              )}
            >
              {index + 1}
            </span>
            <div
              className={cn(
                "relative min-w-0 flex-1 overflow-hidden rounded-2xl transition-shadow",
                index === activeIndex
                  ? "ring-2 ring-stone-400 ring-offset-2 ring-offset-white dark:ring-stone-300 dark:ring-offset-stone-800"
                  : "group-hover/preview:ring-1 group-hover/preview:ring-black/10 dark:group-hover/preview:ring-white/10"
              )}
            >
              <SlideThumbnail slide={slide} />
            </div>
            <Button
              asChild
              variant="ghost"
              className="absolute inset-0 h-full w-full scroll-my-1 rounded-2xl p-0 hover:bg-transparent focus-visible:ring-0 dark:hover:bg-transparent"
              aria-label={`Go to slide ${index + 1}`}
              aria-current={index === activeIndex ? "true" : undefined}
              onClick={() => onSlideSelect(index)}
            >
              <button
                type="button"
                ref={index === activeIndex ? activePreviewRef : undefined}
              />
            </Button>
          </li>
        ))}
      </ol>
    </ScrollArea>
  );
}
