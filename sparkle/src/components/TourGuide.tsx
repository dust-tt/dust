import * as PopoverPrimitive from "@radix-ui/react-popover";
import React, { useEffect, useState } from "react";

import { Button } from "@sparkle/components/Button";
import { cn } from "@sparkle/lib";

interface TourGuideCardProps {
  anchorRef?: React.RefObject<HTMLDivElement>;
  title?: string;
  content?: React.ReactNode;
  visual?: React.ReactNode;
  onNext?: () => void;
  onDismiss?: () => void;
  isLastStep?: boolean;
  className?: string;
  children?: React.ReactNode;
  asPopover?: boolean;
  align?: "start" | "center" | "end";
  side?: "top" | "right" | "bottom" | "left";
  sideOffset?: number;
}

export const TourGuideCardTitle = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("s-heading-lg s-px-3 s-pt-4", className)}
    {...props}
  >
    {children}
  </div>
));
TourGuideCardTitle.displayName = "TourGuideCardTitle";

export const TourGuideCardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "s-copy-base s-px-3 s-text-muted-foreground dark:s-text-muted-foreground-night",
      className
    )}
    {...props}
  >
    {children}
  </div>
));
TourGuideCardContent.displayName = "TourGuideCardContent";

export const TourGuideCardVisual = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "s-aspect-video s-bg-muted-background dark:s-bg-muted-background-night",
      className
    )}
    {...props}
  >
    {children}
  </div>
));
TourGuideCardVisual.displayName = "TourGuideCardVisual";

export const TourGuideCardActions = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, children, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("s-flex s-justify-end s-space-x-2 s-p-2 s-pt-4", className)}
    {...props}
  >
    {children}
  </div>
));
TourGuideCardActions.displayName = "TourGuideCardActions";

export const TourGuideCard = React.forwardRef<
  HTMLDivElement,
  TourGuideCardProps
>(
  ({
    onNext,
    onDismiss,
    isLastStep,
    className,
    children,
    align = "center",
    side = "bottom",
    sideOffset = 4,
  }) => {
    return (
      <PopoverPrimitive.Content
        align={align}
        side={side}
        sideOffset={sideOffset}
        className={cn(
          "s-z-50 s-w-[420px] s-max-w-xs s-space-y-0.5 s-overflow-hidden s-rounded-2xl s-border s-shadow-xl s-transition-all s-duration-300 s-ease-in-out",
          "s-border-highlight-400 s-bg-background s-text-foreground s-ring-2 s-ring-highlight-400/30",
          "dark:s-border-border-night dark:s-bg-background-night dark:s-text-foreground-night",
          className
        )}
      >
        {children}
        <TourGuideCardActions>
          {!isLastStep && onDismiss && (
            <Button variant="outline" label="Dismiss" onClick={onDismiss} />
          )}
          {onNext && (
            <Button
              onClick={onNext}
              variant="highlight"
              label={isLastStep ? "Finish" : "Start Tour"}
            />
          )}
        </TourGuideCardActions>
      </PopoverPrimitive.Content>
    );
  }
);
TourGuideCard.displayName = "TourGuideCard";

export interface TourGuideProps {
  children: React.ReactNode;
  autoStart?: boolean;
  onStart?: () => void;
}

export function TourGuide({
  children,
  autoStart = true,
  onStart,
}: TourGuideProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isActive, setIsActive] = useState(autoStart);
  const [position, setPosition] = useState({
    top: "50%",
    left: "50%",
    width: "0px",
    height: "0px",
  });

  // Get all TourGuideCard children - memoize to prevent unnecessary re-renders
  const cards = React.useMemo(
    () =>
      React.Children.toArray(children).filter(
        (child): child is React.ReactElement<TourGuideCardProps> =>
          React.isValidElement(child) && child.type === TourGuideCard
      ),
    [children]
  );

  // Only run on mount and when autoStart changes
  useEffect(() => {
    if (autoStart) {
      setIsActive(true);
      setCurrentIndex(0);
      onStart?.();
    }
  }, [autoStart, onStart]);

  // Handle position updates - use requestAnimationFrame to prevent excessive updates
  useEffect(() => {
    if (!isActive) {
      return;
    }

    const updatePosition = () => {
      const currentCard = cards[currentIndex];
      if (!currentCard?.props.anchorRef) {
        setPosition({
          top: "50%",
          left: "50%",
          width: "0px",
          height: "0px",
        });
        return;
      }

      const element = currentCard.props.anchorRef.current;
      if (!element) {
        return;
      }

      const rect = element.getBoundingClientRect();
      setPosition({
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`,
      });
    };

    // Initial update
    updatePosition();

    // Set up resize observer
    const resizeObserver = new ResizeObserver(updatePosition);
    const currentCard = cards[currentIndex];
    if (currentCard?.props.anchorRef?.current) {
      resizeObserver.observe(currentCard.props.anchorRef.current);
    }

    // Set up scroll listener
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [currentIndex, cards, isActive]);

  const handleNext = () => {
    if (currentIndex + 1 < cards.length) {
      setCurrentIndex(currentIndex + 1);
    } else {
      setIsActive(false);
    }
  };

  const handleDismiss = () => {
    setIsActive(false);
  };

  if (!isActive || cards.length === 0) {
    return null;
  }

  const currentCard = cards[currentIndex];
  const isLastStep = currentIndex === cards.length - 1;

  return (
    <PopoverPrimitive.Root open={isActive} modal={false}>
      <PopoverPrimitive.Anchor
        className="s-fixed s-transition-all s-duration-300 s-ease-in-out"
        style={{
          top: position.top,
          left: position.left,
          width: position.width,
          height: position.height,
        }}
      />
      {React.cloneElement(currentCard, {
        asPopover: true,
        onNext: handleNext,
        onDismiss: handleDismiss,
        isLastStep,
        className: !currentCard.props.anchorRef ? "s-translate-y-[-50%]" : "",
      })}
    </PopoverPrimitive.Root>
  );
}
