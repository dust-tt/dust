import React, { PropsWithChildren } from "react";
import { cn } from "@viz/lib/utils";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@viz/components/ui";
import { SlideshowNavigation } from "@viz/components/dust/slideshow/v1/navigation";

// Internal components.

const NAVIGATION_HIDE_DELAY = 3000; // Milliseconds before navigation auto-hides.

interface SlidePreviewProps {
  index: number;
  isActive: boolean;
  onClick: () => void;
  slide: React.ReactElement;
}

function SlidePreview({ slide, index, isActive, onClick }: SlidePreviewProps) {
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        isActive={isActive}
        className="h-auto p-2"
        onClick={onClick}
      >
        <div className="w-full cursor-pointer">
          <div
            className={cn(
              "relative w-full aspect-video rounded-xl border text-xs overflow-hidden hover:border-muted",
              isActive ? "border-primary border-2" : "border-border"
            )}
          >
            {/* Scaled down version of the slide */}
            <div
              className="w-full h-full origin-top-left pointer-events-none"
              style={{
                transform: "scale(0.15)",
                width: "667%",
                height: "667%",
              }}
            >
              {React.cloneElement(slide, { isPreview: true })}
            </div>
            {/* Slide number overlay */}
            <span
              className={cn(
                "absolute bottom-1 right-1 text-xs opacity-70 bg-background/80 px-1 rounded z-10"
              )}
            >
              {index + 1}
            </span>
          </div>
        </div>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

interface SlideshowPreviewSidebarProps {
  activeIndex: number;
  onSlideSelect: (index: number) => void;
  slides: React.ReactElement[];
}

export function SlideshowPreviewSidebar({
  activeIndex,
  onSlideSelect,
  slides,
}: SlideshowPreviewSidebarProps) {
  return (
    <Sidebar variant="inset" collapsible="icon" className="bg-gray-50">
      <SidebarHeader className="flex flex-row items-center gap-2 justify-between group-data-[collapsible=icon]:justify-center">
        <span className="font-semibold group-data-[collapsible=icon]:hidden">
          Preview
        </span>
        <SidebarTrigger className="-ml-1" />
      </SidebarHeader>
      <SidebarContent className="group-data-[collapsible=icon]:hidden">
        <SidebarGroup>
          <SidebarGroupContent className="space-y-2">
            <SidebarMenu className="gap-2">
              {slides.map((slide, i) => (
                <SlidePreview
                  key={`slide-preview-${i}`}
                  slide={slide}
                  index={i}
                  isActive={i === activeIndex}
                  onClick={() => onSlideSelect(i)}
                />
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarRail />
    </Sidebar>
  );
}

// Exposed components.

type SlideProps = PropsWithChildren<{
  className?: string;
  isPreview?: boolean;
}>;

export function Slide({ children, className, isPreview = false }: SlideProps) {
  const ref = React.useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      className={cn(
        "w-full h-full flex items-start justify-center overflow-hidden",
        className
      )}
      style={{ fontFamily: "var(--font-geist)" }}
    >
      {isPreview ? (
        <div className="p-2 w-full h-full">{children}</div>
      ) : (
        <div className="p-8 w-full">{children}</div>
      )}
    </div>
  );
}

type SlideshowProps = PropsWithChildren<{
  className?: string;
}>;

export function Slideshow({ children, className }: SlideshowProps) {
  const slides = React.useMemo(() => {
    const childArray = React.Children.toArray(children) as React.ReactElement[];

    // Validate that all children are Slide components.
    const invalidChildren = childArray.filter((child) => {
      return !React.isValidElement(child) || child.type !== Slide;
    });

    if (invalidChildren.length > 0) {
      throw new Error(
        "Slideshow: All children must be Slideshow.Slide components. " +
          `Found ${invalidChildren.length} invalid child(ren).`
      );
    }

    return childArray;
  }, [children]);

  const [activeIndex, setActiveIndex] = React.useState(0);
  const [showNavigation, setShowNavigation] = React.useState(true);
  const hideTimeoutRef = React.useRef<NodeJS.Timeout>();

  const goToSlide = React.useCallback(
    (index: number) => {
      setActiveIndex(Math.min(Math.max(index, 0), slides.length - 1));
    },
    [slides.length]
  );

  const nextSlide = React.useCallback(() => {
    setActiveIndex((current) => Math.min(current + 1, slides.length - 1));
  }, [slides.length]);

  const prevSlide = React.useCallback(() => {
    setActiveIndex((current) => Math.max(current - 1, 0));
  }, []);

  // Auto-hide navigation functionality
  const resetHideTimer = React.useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
    setShowNavigation(true);
    hideTimeoutRef.current = setTimeout(() => {
      setShowNavigation(false);
    }, NAVIGATION_HIDE_DELAY);
  }, []);

  React.useEffect(() => {
    resetHideTimer();
    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, [resetHideTimer, activeIndex]); // Reset timer when slide changes.

  if (slides.length === 0) {
    return (
      <div className="@container h-full w-full flex items-center justify-center">
        <div className="text-muted-foreground">No slides available</div>
      </div>
    );
  }

  return (
    <div
      className={cn("@container h-full w-full", className)}
      role="region"
      aria-label="Slideshow"
    >
      <SidebarProvider>
        <div className="hidden @xl:block">
          <SlideshowPreviewSidebar
            slides={slides}
            activeIndex={activeIndex}
            onSlideSelect={goToSlide}
          />
        </div>
        <SidebarInset>
          <main
            className="flex flex-1 items-center justify-center relative"
            aria-live="polite"
            aria-label={`Slide ${activeIndex + 1} of ${slides.length}`}
            onMouseMove={resetHideTimer}
            onKeyDown={resetHideTimer}
            onClick={resetHideTimer}
          >
            {slides[activeIndex]}
            <div
              className={`transition-opacity duration-300 ${
                showNavigation ? "opacity-100" : "opacity-0 pointer-events-none"
              }`}
            >
              <SlideshowNavigation
                index={activeIndex}
                total={slides.length}
                prev={prevSlide}
                next={nextSlide}
              />
            </div>
          </main>
        </SidebarInset>
      </SidebarProvider>
    </div>
  );
}

// Typography components.

export const Title = ({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) => (
  <h1
    className={cn("font-semibold text-7xl leading-tight m-0 mb-6", className)}
    style={{ fontFamily: "var(--font-geist-mono)" }}
  >
    {children}
  </h1>
);

export const Heading = ({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) => (
  <h2
    className={cn("font-semibold text-5xl leading-tight m-0 mb-4", className)}
    style={{ fontFamily: "var(--font-geist-mono)" }}
  >
    {children}
  </h2>
);

export const Text = ({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) => (
  <p
    className={cn("font-normal text-sm m-0", className)}
    style={{ fontFamily: "var(--font-geist)" }}
  >
    {children}
  </p>
);

Slideshow.Slide = Slide;
Slideshow.Title = Title;
Slideshow.Heading = Heading;
Slideshow.Text = Text;
