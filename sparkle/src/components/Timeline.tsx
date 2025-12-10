import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import { cn } from "@sparkle/lib/utils";

const markerVariants = cva(
  "s-flex s-h-3.5 s-w-3.5 s-items-center s-justify-center s-rounded-full s-border-2",
  {
    variants: {
      variant: {
        complete: cn(
          "s-border-highlight-500 dark:s-border-highlight-500-night",
          "s-bg-highlight-500 dark:s-bg-highlight-500-night",
          "s-shadow-sm"
        ),
        current: cn(
          "s-border-highlight-500 dark:s-border-highlight-500-night",
          "s-bg-background dark:s-bg-background-night",
          "s-shadow-sm"
        ),
        upcoming: cn(
          "s-border-border dark:s-border-border-night",
          "s-bg-background dark:s-bg-background-night"
        ),
      },
    },
    defaultVariants: {
      variant: "complete",
    },
  }
);

const lineVariants = cva("s-w-[2px] s-flex-1", {
  variants: {
    variant: {
      complete: "s-bg-highlight-500 dark:s-bg-highlight-500-night",
      current: "s-bg-highlight-500 dark:s-bg-highlight-500-night",
      upcoming: "s-bg-border dark:s-bg-border-night",
    },
  },
  defaultVariants: {
    variant: "complete",
  },
});

export interface TimelineProps extends React.HTMLAttributes<HTMLDivElement> {
  /**
   * When true, last item does not render a line below it.
   */
  bounded?: boolean;
}

function Timeline({
  className,
  children,
  bounded = true,
  ...props
}: TimelineProps) {
  const items = React.Children.toArray(children);

  return (
    <div
      className={cn(
        "s-flex s-flex-col s-text-foreground dark:s-text-foreground-night",
        className
      )}
      {...props}
    >
      {items.map((child, index) => {
        if (!React.isValidElement<TimelineItemProps>(child)) {
          return child;
        }

        const isLast = index === items.length - 1;

        return React.cloneElement(child, {
          isLast: bounded ? isLast : false,
        });
      })}
    </div>
  );
}

export interface TimelineItemProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof markerVariants> {
  title?: string;
  description?: React.ReactNode;
  meta?: React.ReactNode;
  isLast?: boolean;
}

const TimelineItem = React.forwardRef<HTMLDivElement, TimelineItemProps>(
  (
    {
      className,
      variant = "complete",
      title,
      description,
      meta,
      children,
      isLast,
      ...props
    },
    ref
  ) => {
    const showBottomLine = !isLast;

    return (
      <div
        ref={ref}
        className={cn(
          "s-grid s-grid-cols-[auto,1fr] s-gap-x-4 sm:s-gap-x-6",
          className
        )}
        {...props}
      >
        <div
          className="s-flex s-flex-col s-items-center s-gap-2 s-px-1 s-pb-2"
          aria-hidden="true"
        >
          <div className={cn("s-flex-shrink-0", markerVariants({ variant }))} />
          {showBottomLine && (
            <div className={cn("s-flex-1", lineVariants({ variant }))} />
          )}
        </div>
        <div className="s-flex s-flex-col s-gap-1 s-pb-4">
          {title && (
            <div className="s-heading-sm s-text-foreground dark:s-text-foreground-night">
              {title}
            </div>
          )}
          {meta && (
            <div className="s-text-xs s-font-medium s-text-muted-foreground dark:s-text-muted-foreground-night">
              {meta}
            </div>
          )}
          {description && (
            <div className="s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
              {description}
            </div>
          )}
          {children && <div className="s-mt-2">{children}</div>}
        </div>
      </div>
    );
  }
);
TimelineItem.displayName = "TimelineItem";

Timeline.displayName = "Timeline";
Timeline.Item = TimelineItem;

export { Timeline, TimelineItem };
