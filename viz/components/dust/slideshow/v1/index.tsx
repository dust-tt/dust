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
      style={{ fontFamily: "var(--font-inter)" }}
    >
      <div
        className={cn(
          "w-full flex-1 min-h-0",
          "grid grid-cols-6 [grid-template-rows:repeat(4,_auto)] gap-y-16 gap-x-4 pb-4",
          variant === "top" ? "slide-top-padding" : "slide-centered-padding"
        )}
      >
        {isPreview ? (
          <div className="p-4 w-full h-full" style={{ fontSize: "0.4em" }}>
            {children}
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

const NAVIGATION_HIDE_DELAY = 3000; // Milliseconds before navigation auto-hides

function hasDisplayName(
  component: unknown
): component is { displayName: string } {
  return (
    typeof component === "function" &&
    typeof (component as { displayName?: string }).displayName === "string"
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
    "Slideshow.Slide.TitleTopH2",
    "Slideshow.Slide.BulletsOnly",
    "Slideshow.Slide.Quote",
    "Slideshow.Slide.Columns",
    "Slideshow.Slide.Columns2",
    "Slideshow.Slide.Columns3",
    "Slideshow.Slide.Columns4",
    "Slideshow.Slide.BulletList",
    "Slideshow.Slide.BulletItem",
    "Slideshow.Slide.SlideWithChart",
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
  const slides = validateSlideChildren(children);

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
    className={cn(
      "slide-title font-semibold leading-96p m-0 mb-6 break-normal hyphens-none",
      className
    )}
    style={{ fontFamily: "var(--font-inter)" }}
  >
    {children}
  </h1>
);

export const Heading1 = ({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) => (
  <h1 className={cn("slide-heading1", className)}>{children}</h1>
);

export const Heading2 = ({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) => (
  <h2 className={cn("slide-heading2", className)}>{children}</h2>
);

export const Heading3 = ({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) => (
  <h3 className={cn("text-3xl leading-tight m-0 mb-4", className)}>
    {children}
  </h3>
);

export const TextBody1 = ({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) => (
  <p
    className={cn("font-normal text-5xl leading-123p m-0", className)}
    style={{ fontFamily: "var(--font-inter)" }}
  >
    {children}
  </p>
);

export const TextBody2 = ({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) => (
  <p
    className={cn("font-normal text-4xl leading-123p m-0", className)}
    style={{ fontFamily: "var(--font-inter)" }}
  >
    {children}
  </p>
);

export const TextBody3 = ({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) => (
  <p
    className={cn("font-normal text-2xl leading-140p m-0", className)}
    style={{ fontFamily: "var(--font-inter)" }}
  >
    {children}
  </p>
);

// Slide-level layout components.

interface CoverProps {
  className?: string;
  isPreview?: boolean;
  title: string;
  theme?: "light" | "dark";
}

export const Cover = ({
  className,
  isPreview = false,
  title,
  theme = "dark",
}: CoverProps) => (
  <Slide
    variant="top"
    className={cn(`slide-cover-${theme}`, className)}
    isPreview={isPreview}
  >
    <Slideshow.Title className="col-span-4 row-span-2">{title}</Slideshow.Title>
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
      <Heading1 className={titleClassName}>{title}</Heading1>
      <ul className="space-y-4">
        {items.map((item, index) => (
          <li key={index} className="flex items-start">
            <span className="text-2xl mr-4 mt-1 opacity-60">•</span>
            <TextBody1 className="flex-1">{item}</TextBody1>
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
  theme?: "light" | "dark";
}>;

export const Full = ({
  children,
  className,
  isPreview = false,
  theme = "light",
}: FullProps) => (
  <Slide
    variant="top"
    className={cn(`slide-cover-${theme}`, className)}
    isPreview={isPreview}
  >
    <Col span={6} rowSpan={4} className="w-full h-full">
      {children}
    </Col>
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
  theme?: "light" | "dark";
}>;

export const TitleTop = ({
  title,
  children,
  className,
  isPreview = false,
  theme = "dark",
}: TitleTopProps) => (
  <Slide
    variant="top"
    className={cn(`slide-cover-${theme}`, className)}
    isPreview={isPreview}
  >
    <Heading1 className="col-span-4 row-span-1">{title}</Heading1>
    {children && (
      <div className="slide-content row-start-3 col-start-2 row-span-2 col-span-3">
        {children}
      </div>
    )}
  </Slide>
);
TitleTop.displayName = "Slideshow.Slide.TitleTop";

type TitleTopH2Props = PropsWithChildren<{
  className?: string;
  isPreview?: boolean;
  title: string;
  titleClassName?: string;
  theme?: "light" | "dark";
}>;

export const TitleTopH2 = ({
  title,
  children,
  className,
  isPreview = false,
  theme = "dark",
}: TitleTopH2Props) => (
  <Slide
    variant="top"
    className={cn(`slide-cover-${theme}`, className)}
    isPreview={isPreview}
  >
    <Heading2 className="col-span-4 row-span-1">{title}</Heading2>
    {children && (
      <div className="slide-content row-start-3 col-start-2 row-span-2 col-span-3">
        {children}
      </div>
    )}
  </Slide>
);
TitleTopH2.displayName = "Slideshow.Slide.TitleTopH2";

export const Col = ({
  span = 1,
  rowSpan = 1,
  offset = 0,
  children,
  className,
  rowStart,
}: PropsWithChildren<{
  span?: number;
  rowSpan?: number;
  offset?: number;
  className?: string;
  rowStart?: number;
}>) => (
  <div
    style={{
      gridColumn: offset ? `${offset + 1} / span ${span}` : `span ${span}`,
      gridRow: rowStart ? `${rowStart} / span ${rowSpan}` : `span ${rowSpan}`,
    }}
    className={className}
  >
    {children}
  </div>
);

const BASE_COLS = 6;

type ColumnsProps = PropsWithChildren<{
  title?: string;
  description?: string;
  theme?: "light" | "dark";
  className?: string;
  max?: 4 | 3 | 2; // set by Columns3, Columns4 etc.
  isPreview?: boolean;
}>;

export const Columns = ({
  children,
  className,
  title,
  description,
  theme = "light",
  max,
  isPreview = false,
}: ColumnsProps) => {
  const items = React.Children.toArray(children).slice(0, max ?? 999);
  const cols = max ?? items.length;

  return (
    <Slide
      variant="top"
      className={cn(`slide-cover-${theme}`, className)}
      isPreview={isPreview}
    >
      {title && (
        <Col span={4}>
          <Heading2>{title}</Heading2>
        </Col>
      )}
      {description && (
        <Col span={5}>
          <TextBody2 className="slide-content">{description}</TextBody2>
        </Col>
      )}

      {items.map((el, i) => (
        <Col key={i} span={Math.floor(BASE_COLS / cols)} rowSpan={2}>
          {el}
        </Col>
      ))}
    </Slide>
  );
};
Columns.displayName = "Slideshow.Slide.Columns";

/* Aliases ------------------------------------------------------ */
const Columns2 = (props: ColumnsProps) => <Columns {...props} max={2} />;
Columns2.displayName = "Slideshow.Slide.Columns2";
const Columns3 = (props: ColumnsProps) => <Columns {...props} max={3} />;
Columns3.displayName = "Slideshow.Slide.Columns3";
const Columns4 = (props: ColumnsProps) => <Columns {...props} max={4} />;
Columns4.displayName = "Slideshow.Slide.Columns4";

type ItemProps = PropsWithChildren<{ heading: string; className?: string }>;

export const Item = ({ heading, children, className }: ItemProps) => (
  <div className={cn("space-y-3", className)}>
    <Col span={4}>
      <Slideshow.TextBody1>{heading}</Slideshow.TextBody1>
    </Col>
    {/* leave children untouched so callers can pass ANY markup */}
    {typeof children === "string" || typeof children === "number" ? (
      <Slideshow.TextBody2 className="slide-content">
        {children}
      </Slideshow.TextBody2>
    ) : (
      <div className="slide-content">{children}</div>
    )}
  </div>
);

const BulletList = ({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) => (
  <ul className={cn("list-disc pl-4 ml-4 space-y-1 slide-content", className)}>
    {children}
  </ul>
);
BulletList.displayName = "Slideshow.Slide.BulletList";

const BulletItem = ({ children }: PropsWithChildren) => (
  <li>
    <TextBody3>{children}</TextBody3>
  </li>
);
BulletItem.displayName = "Slideshow.Slide.BulletItem";

const SlideWithChart = ({
  children,
  className,
  theme = "light",
  title,
  isPreview = false,
  description,
}: PropsWithChildren<{
  className?: string;
  title: string;
  theme?: "light" | "dark";
  isPreview?: boolean;
  description?: string;
}>) => (
  <Slide
    variant="top"
    className={cn(`slide-cover-${theme}`, className)}
    isPreview={isPreview}
  >
    {/* Title – row 1, cols 1-2 */}
    <Col span={2} rowSpan={1} rowStart={1}>
      <Heading2>{title}</Heading2>
    </Col>

    {/* Spacer – row 2, cols 1-2 (keeps blank line) */}
    <Col span={2} rowSpan={1} rowStart={2} />

    {/* Description – row 3, cols 1-2 */}
    <Col span={2} rowSpan={1} rowStart={3}>
      <TextBody2 className="slide-content">{description}</TextBody2>
    </Col>

    {/* Chart – columns 3-6, rows 1-4  */}
    <Col span={4} rowSpan={4} offset={2} className="flex items-center">
      {children}
    </Col>
  </Slide>
);
SlideWithChart.displayName = "Slideshow.Slide.SlideWithChart";

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
            <TextBody1 className="flex-1">{item}</TextBody1>
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
  Heading1,
  Heading2,
  Heading3,
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
    TitleTopH2,
    Columns,
    Columns2,
    Columns3,
    Columns4,
    Item,
    BulletList,
    BulletItem,
    SlideWithChart,
  },
  TextBody1,
  TextBody2,
  Title,
};
