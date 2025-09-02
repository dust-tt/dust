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
  variant?: "centered" | "top";
}>;

export function Slide({
  children,
  className,
  isPreview = false,
  variant = "top",
}: SlideProps) {
  const ref = React.useRef<HTMLDivElement>(null);

  return (
    <div
      ref={ref}
      className={cn(
        "w-full h-full flex overflow-hidden responsive-text justify-center",
        variant === "centered" ? "items-center" : "items-start",
        className
      )}
      style={{ fontFamily: "var(--font-geist)" }}
    >
      {isPreview ? (
        <div className="p-2 w-full h-full" style={{ fontSize: "0.4em" }}>
          {children}
        </div>
      ) : (
        <div
          className={cn(
            "w-full",
            variant === "top" ? "slide-top-padding" : "slide-centered-padding"
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

const NAVIGATION_HIDE_DELAY = 3000; // Milliseconds before navigation auto-hides

function hasDisplayName(component: any): component is { displayName: string } {
  return (
    typeof component === "function" && typeof component.displayName === "string"
  );
}

function validateSlideChildren(
  children: React.ReactNode
): React.ReactElement[] {
  const childArray = React.Children.toArray(children) as React.ReactElement[];

  const validSlideDisplayNames = new Set([
    "Slideshow.Slide.Base",
    "Slideshow.Slide.Cover",
    "Slideshow.Slide.Bullets",
    "Slideshow.Slide.Split",
    "Slideshow.Slide.Full",
    "Slideshow.Slide.TitleCentered",
    "Slideshow.Slide.TitleTop",
    "Slideshow.Slide.BulletsOnly",
    "Slideshow.Slide.Quote",
  ]);

  const invalidChildren = childArray.filter((child) => {
    if (!React.isValidElement(child)) {
      return true;
    }

    if (!hasDisplayName(child.type)) {
      return true;
    }

    return !validSlideDisplayNames.has(child.type.displayName);
  });

  if (invalidChildren.length > 0) {
    throw new Error(
      "Slideshow: All children must be Slideshow.Slide components. " +
        `Found ${invalidChildren.length} invalid child(ren).`
    );
  }

  return childArray;
}

type SlideshowProps = PropsWithChildren<{
  className?: string;
}>;

function SlideshowRoot({ children, className }: SlideshowProps) {
  const slides = React.useMemo(
    () => validateSlideChildren(children),
    [children]
  );

  const [activeIndex, setActiveIndex] = React.useState(0);
  const [isNavigationVisible, setIsNavigationVisible] = React.useState(true);
  const hideTimeoutRef = React.useRef<ReturnType<typeof setTimeout>>();

  const resetHideTimer = React.useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
    }
    setIsNavigationVisible(true);
    hideTimeoutRef.current = setTimeout(() => {
      setIsNavigationVisible(false);
    }, NAVIGATION_HIDE_DELAY);
  }, []);

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

  React.useEffect(() => {
    // Start the hide timer on mount.
    resetHideTimer();

    return () => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
      }
    };
  }, [resetHideTimer]);

  // Reset timer when slide changes.
  React.useEffect(() => {
    resetHideTimer();
  }, [activeIndex, resetHideTimer]);

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
      onMouseMove={resetHideTimer}
      onClick={resetHideTimer}
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
          >
            {slides[activeIndex]}
            <SlideshowNavigation
              index={activeIndex}
              isVisible={isNavigationVisible}
              total={slides.length}
              prev={prevSlide}
              next={nextSlide}
            />
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
    className={cn("font-normal text-lg m-0", className)}
    style={{ fontFamily: "var(--font-geist)" }}
  >
    {children}
  </p>
);

// Slide-level layout components.

interface CoverProps {
  className?: string;
  isPreview?: boolean;
  subtitle?: string;
  subtitleClassName?: string;
  title: string;
  titleClassName?: string;
}

export const Cover = ({
  className,
  isPreview = false,
  subtitle,
  subtitleClassName,
  title,
  titleClassName,
}: CoverProps) => (
  <Slide variant="centered" className={className} isPreview={isPreview}>
    <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
      <Title className={titleClassName}>{title}</Title>
      {subtitle && (
        <Text className={cn("opacity-80", subtitleClassName)}>{subtitle}</Text>
      )}
    </div>
  </Slide>
);
Cover.displayName = "Slideshow.Slide.Cover";

interface BulletsProps {
  className?: string;
  isPreview?: boolean;
  items: string[];
  title: string;
  titleClassName?: string;
}

export const Bullets = ({
  title,
  items,
  className,
  titleClassName,
  isPreview = false,
}: BulletsProps) => (
  <Slide variant="top" className={className} isPreview={isPreview}>
    <div className="h-full flex flex-col space-y-6">
      <Heading className={titleClassName}>{title}</Heading>
      <ul className="space-y-4">
        {items.map((item, index) => (
          <li key={index} className="flex items-start">
            <span className="text-2xl mr-4 mt-1 opacity-60">•</span>
            <Text className="flex-1">{item}</Text>
          </li>
        ))}
      </ul>
    </div>
  </Slide>
);
Bullets.displayName = "Slideshow.Slide.Bullets";

type TwoChildren = [React.ReactNode, React.ReactNode];

interface SplitProps {
  children: TwoChildren;
  className?: string;
  isPreview?: boolean;
}

export const Split = ({
  children,
  className,
  isPreview = false,
}: SplitProps) => (
  <Slide variant="top" className={className} isPreview={isPreview}>
    <div className="h-full grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
      <div>{children[0]}</div>
      <div>{children[1]}</div>
    </div>
  </Slide>
);
Split.displayName = "Slideshow.Slide.Split";

type FullProps = PropsWithChildren<{
  className?: string;
  isPreview?: boolean;
}>;

export const Full = ({ children, className, isPreview = false }: FullProps) => (
  <Slide variant="top" className={className} isPreview={isPreview}>
    <div className="h-full flex flex-col space-y-6">{children}</div>
  </Slide>
);
Full.displayName = "Slideshow.Slide.Full";

interface TitleCenteredProps {
  className?: string;
  isPreview?: boolean;
  title: string;
  titleClassName?: string;
}

export const TitleCentered = ({
  className,
  isPreview = false,
  title,
  titleClassName,
}: TitleCenteredProps) => (
  <Slide variant="centered" className={className} isPreview={isPreview}>
    <div className="h-full flex flex-col items-center justify-center text-center">
      <Title className={titleClassName}>{title}</Title>
    </div>
  </Slide>
);
TitleCentered.displayName = "Slideshow.Slide.TitleCentered";

type TitleTopProps = PropsWithChildren<{
  className?: string;
  isPreview?: boolean;
  title: string;
  titleClassName?: string;
}>;

export const TitleTop = ({
  title,
  children,
  className,
  titleClassName,
  isPreview = false,
}: TitleTopProps) => (
  <Slide variant="top" className={className} isPreview={isPreview}>
    <div className="h-full flex flex-col">
      <div className="text-center pb-8">
        <Title className={titleClassName}>{title}</Title>
      </div>
      <div className="flex-1 flex flex-col justify-center">{children}</div>
    </div>
  </Slide>
);
TitleTop.displayName = "Slideshow.Slide.TitleTop";

interface BulletsOnlyProps {
  className?: string;
  isPreview?: boolean;
  items: string[];
}

export const BulletsOnly = ({
  className,
  isPreview = false,
  items,
}: BulletsOnlyProps) => (
  <Slide variant="top" className={className} isPreview={isPreview}>
    <div className="h-full flex flex-col">
      <ul className="space-y-6">
        {items.map((item, index) => (
          <li key={index} className="flex items-start">
            <span className="text-3xl mr-6 mt-1 opacity-60">•</span>
            <Text className="flex-1">{item}</Text>
          </li>
        ))}
      </ul>
    </div>
  </Slide>
);
BulletsOnly.displayName = "Slideshow.Slide.BulletsOnly";

interface QuoteProps {
  author: string;
  authorClassName?: string;
  className?: string;
  isPreview?: boolean;
  quote: string;
  quoteClassName?: string;
}

export const Quote = ({
  author,
  authorClassName,
  className,
  isPreview = false,
  quote,
  quoteClassName,
}: QuoteProps) => (
  <Slide variant="centered" className={className} isPreview={isPreview}>
    <div className="h-full flex flex-col items-center justify-center text-center space-y-8">
      <blockquote
        className={cn(
          "text-3xl font-light italic leading-relaxed max-w-4xl",
          quoteClassName
        )}
      >
        &quot;{quote}&quot;
      </blockquote>
      <cite className={cn("text-xl opacity-80 not-italic", authorClassName)}>
        — {author}
      </cite>
    </div>
  </Slide>
);
Quote.displayName = "Slideshow.Slide.Quote";

Slide.displayName = "Slideshow.Slide.Base";

// Namespace export.
export const Slideshow = {
  Heading,
  Root: SlideshowRoot,
  Slide: {
    Base: Slide,
    Bullets,
    BulletsOnly,
    Cover,
    Full,
    Quote,
    Split,
    TitleCentered,
    TitleTop,
  },
  Text,
  Title,
};
