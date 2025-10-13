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

// Preview components.

interface SlideMiniatureProps {
  slide: React.ReactElement;
}

export function SlideMiniature({ slide }: SlideMiniatureProps) {
  return (
    <div className="absolute inset-0 overflow-hidden">
      <div
        className="origin-top-left pointer-events-none"
        style={{
          width: "1920px",
          height: "1080px",
          transform: "scale(0.11)",
        }}
      >
        {React.cloneElement(slide, { isPreview: false })}
      </div>
    </div>
  );
}

interface SlidePreviewProps {
  index: number;
  isActive: boolean;
  onClick: () => void;
  slide: React.ReactElement;
}

export function SlidePreview({
  slide,
  index,
  isActive,
  onClick,
}: SlidePreviewProps) {
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
              "relative w-full aspect-video rounded-xl overflow-hidden hover:border-accent",
              "border-2 border-box",
              isActive && "border-accent-foreground"
            )}
          >
            <SlideMiniature slide={slide} />

            <span className="absolute bottom-1 right-1 text-xs opacity-70 bg-background/80 px-1 rounded z-10">
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

// Internal components.

type ColProps = PropsWithChildren<{
  className?: string;
  offset?: number;
  rowSpan?: number;
  rowStart?: number;
  span?: number;
}>;

/**
 * Col - Grid positioning helper component
 *
 * Abstracts CSS Grid positioning into semantic props:
 * - span: How many columns to occupy (1-6)
 * - rowSpan: How many rows to occupy (1-4)
 * - offset: Skip columns from the left (0-5)
 * - rowStart: Start at specific row (1-4)
 *
 * Examples:
 * - Title across full width: <Col span={6}>
 * - Half-width content: <Col span={3}>
 * - Chart in right half: <Col span={3} offset={3}>
 */
const Col = ({
  children,
  className,
  offset = 0,
  rowSpan = 1,
  rowStart,
  span = 1,
}: ColProps) => (
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
  description?: string;
  max?: 4 | 3 | 2; // Set by Columns3, Columns4 etc.
  title?: string;
}> &
  BaseProps;

export const Columns = ({
  children,
  className,
  description,
  isPreview = false,
  max,
  theme = "light",
  title,
}: ColumnsProps) => {
  const items = React.Children.toArray(children).slice(0, max ?? 999);
  const cols = Math.max(1, Math.min(max ?? items.length, 4)); // Clamp 1..4.

  const hasTitle = Boolean(title);
  const hasDesc = Boolean(description);
  const startRow = 1 + (hasTitle ? 1 : 0); // Where cards begin.

  return (
    <Slide
      variant="top"
      className={cn(`slide-cover-${theme}`, className)}
      isPreview={isPreview}
    >
      {hasTitle && (
        <Col span={BASE_COLS}>
          <Heading2>{title}</Heading2>
          {hasDesc && (
            <TextBody2 className="slide-content mt-4 ml-1">
              {description}
            </TextBody2>
          )}
        </Col>
      )}

      {cols === 4
        ? items.slice(0, 4).map((el, i) => {
            // Two rows of two cards: offsets 0 or 3; rows startRow and startRow+1.
            const rowStart = startRow + Math.floor(i / 2);
            const offset = (i % 2) * 3;
            return (
              <Col
                key={i}
                span={3}
                rowSpan={1}
                rowStart={rowStart}
                offset={offset}
              >
                {el}
              </Col>
            );
          })
        : items.map((el, i) => {
            const span = cols === 3 ? 2 : 3; // 3→span2, 2→span3.
            return (
              <Col key={i} span={span} rowSpan={2} rowStart={startRow}>
                {el}
              </Col>
            );
          })}
    </Slide>
  );
};
Columns.displayName = "Slideshow.Preset.Columns";

// Slide Component - Foundation of the slideshow system
// Uses a 6-column × 4-row CSS grid to provide consistent, professional layouts

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
      style={{
        fontFamily: "var(--font-inter)",
      }}
    >
      <div
        className={cn(
          "w-full h-full flex-1 min-h-0",
          "grid grid-cols-6 [grid-template-rows:repeat(4,_auto)] gap-y-8 gap-x-4 pb-4",
          variant === "top" ? "slide-top-padding" : "slide-centered-padding"
        )}
      >
        {isPreview ? (
          <div className="p-4 w-full h-full">{children}</div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
Slide.displayName = "Slideshow.Slide.Base";

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

  const invalidChildren = childArray.filter((child) => {
    if (!React.isValidElement(child)) {
      return true;
    }

    if (!hasDisplayName(child.type)) {
      return true;
    }

    return false;
  });

  if (invalidChildren.length > 0) {
    throw new Error(
      "Slideshow: All children must be valid React components with display name. " +
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
    className={cn("font-normal text-3xl leading-123p m-0", className)}
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

// Preset slide components.

interface BaseProps {
  className?: string;
  isPreview?: boolean;
  theme?: "light" | "dark";
}

type BasePropsWithChildren = PropsWithChildren<BaseProps>;

interface CoverProps extends BaseProps {
  title: string;
  titleClassName?: string;
}

export const Cover = ({
  className,
  isPreview = false,
  theme = "light",
  title,
  titleClassName,
}: CoverProps) => (
  <div
    className={cn(
      `slide-cover-${theme} flex justify-center items-center h-full w-full`,
      className
    )}
  >
    {isPreview ? (
      <div className="p-4 w-full h-full">
        <Title className={cn("text-center", titleClassName)}>{title}</Title>
      </div>
    ) : (
      <Title className={cn("text-center", titleClassName)}>{title}</Title>
    )}
  </div>
);
Cover.displayName = "Slideshow.Preset.Cover";

type FullProps = BasePropsWithChildren;

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
Full.displayName = "Slideshow.Preset.Full";

type TitleTopProps = PropsWithChildren<{
  title: string;
  titleClassName?: string;
}> &
  BaseProps;

export const TitleTop = ({
  title,
  children,
  className,
  titleClassName,
  isPreview = false,
  theme = "light",
}: TitleTopProps) => (
  <Slide
    variant="top"
    className={cn(`slide-cover-${theme}`, className)}
    isPreview={isPreview}
  >
    <Heading1 className={cn(`col-span-5 row-span-1`, titleClassName)}>
      {title}
    </Heading1>
    {children && (
      <div className="slide-content row-start-2 row-span-3 col-span-6 p-x-4 flex flex-col gap-4">
        {children}
      </div>
    )}
  </Slide>
);
TitleTop.displayName = "Slideshow.Preset.TitleTop";

type TitleTopH2Props = PropsWithChildren<{
  title: string;
  titleClassName?: string;
}> &
  BaseProps;

export const TitleTopH2 = ({
  title,
  titleClassName,
  children,
  className,
  isPreview = false,
  theme = "light",
}: TitleTopH2Props) => (
  <Slide
    variant="top"
    className={cn(`slide-cover-${theme}`, className)}
    isPreview={isPreview}
  >
    <Heading2 className={cn(`col-span-5 row-span-1`, titleClassName)}>
      {title}
    </Heading2>
    {children && (
      <div className="slide-content row-start-2 row-span-3 col-span-6 p-x-4">
        {children}
      </div>
    )}
  </Slide>
);
TitleTopH2.displayName = "Slideshow.Preset.TitleTopH2";

// Column-based aliases.

const Columns2 = (props: ColumnsProps) => <Columns {...props} max={2} />;
Columns2.displayName = "Slideshow.Preset.Columns2";
const Columns3 = (props: ColumnsProps) => <Columns {...props} max={3} />;
Columns3.displayName = "Slideshow.Preset.Columns3";
const Columns4 = (props: ColumnsProps) => <Columns {...props} max={4} />;
Columns4.displayName = "Slideshow.Preset.Columns4";

type ItemProps = PropsWithChildren<{ heading: string; className?: string }>;

export const Item = ({ heading, children, className }: ItemProps) => (
  <div className={cn("flex flex-col gap-4", className)}>
    <TextBody1>{heading}</TextBody1>
    {typeof children === "string" || typeof children === "number" ? (
      <TextBody2 className="slide-content">{children}</TextBody2>
    ) : (
      <div className="slide-content flex flex-col gap-4">{children}</div>
    )}
  </div>
);

const BulletList = ({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) => (
  <ul className={cn("list-disc ml-4 slide-content", className)}>{children}</ul>
);
BulletList.displayName = "Slideshow.Content.BulletList";

const BulletItem = ({
  children,
  className,
}: PropsWithChildren<{ className?: string }>) => (
  <li className={cn("mb-4 last:mb-0", className)}>
    <TextBody3>{children}</TextBody3>
  </li>
);
BulletItem.displayName = "Slideshow.Content.BulletItem";

type ChartSplitProps = PropsWithChildren<{
  title: string;
  description?: string;
  titleClassName?: string;
}> &
  BaseProps;

const ChartSplit = ({
  children,
  className,
  description,
  isPreview = false,
  theme = "light",
  title,
  titleClassName,
}: ChartSplitProps) => (
  <Slide
    variant="top"
    className={cn(`slide-cover-${theme}`, className)}
    isPreview={isPreview}
  >
    {/* Title – row 1, cols 1-2 */}
    <Col span={2} rowSpan={1} rowStart={1}>
      <Heading2 className={titleClassName}>{title}</Heading2>
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
ChartSplit.displayName = "Slideshow.Preset.ChartSplit";

interface QuoteProps extends BaseProps {
  author: string;
  authorClassName?: string;
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
  theme = "light",
}: QuoteProps) => (
  <Slide
    variant="centered"
    className={cn(`slide-cover-${theme}`, className)}
    isPreview={isPreview}
  >
    <Col
      span={6}
      rowSpan={4}
      className="flex flex-col items-center justify-center text-center space-y-8 slide-content"
    >
      <TextBody2 className={cn("font-light italic", quoteClassName)}>
        “{quote}”
      </TextBody2>

      <TextBody3 className={cn("opacity-80 not-italic", authorClassName)}>
        — {author}
      </TextBody3>
    </Col>
  </Slide>
);
Quote.displayName = "Slideshow.Preset.Quote";

// Namespace export.
export const Slideshow = {
  Root: SlideshowRoot,
  Preset: {
    ChartSplit,
    Columns,
    Columns2,
    Columns3,
    Columns4,
    Cover,
    Full,
    Quote,
    TitleTop,
    TitleTopH2,
  },
  Content: {
    BulletItem,
    BulletList,
    Item,
  },
  Text: {
    Body1: TextBody1,
    Body2: TextBody2,
    Body3: TextBody3,
    Heading1,
    Heading2,
    Heading3,
    Title,
  },
};
