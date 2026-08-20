import { cn } from "@sparkle/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

const markerVariants = cva(
  "flex h-3.5 w-3.5 items-center justify-center rounded-full border-2",
  {
    variants: {
      variant: {
        complete: cn("border-highlight-500", "bg-highlight-500", "shadow-sm"),
        current: cn("border-highlight-500", "bg-background", "shadow-sm"),
        upcoming: cn("border-border", "bg-background"),
      },
    },
    defaultVariants: {
      variant: "complete",
    },
  }
);

const lineVariants = cva("w-[2px] flex-1", {
  variants: {
    variant: {
      complete: "bg-highlight-500",
      current: "bg-highlight-500",
      upcoming: "bg-border",
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

/**
 * Displays a vertical sequence of events with connecting markers; each `Timeline.Item`
 * takes a `title`, optional `meta` and `description`, and a `variant` that styles its
 * marker. Use it to show ordered, time-based progressions such as version history,
 * activity feeds, or process steps, conveying state through the item variants.
 *
 * @summary Vertical event timeline.
 */
function Timeline({
  className,
  children,
  bounded = true,
  ...props
}: TimelineProps) {
  const items = React.Children.toArray(children);

  return (
    <div className={cn("flex flex-col text-foreground", className)} {...props}>
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
  /** Small metadata line rendered between the title and description, e.g. a date or author. */
  meta?: React.ReactNode;
  /** Set by the parent Timeline; suppresses the connecting line below the item. */
  isLast?: boolean;
}

/**
 * One event in a `Timeline`: a marker and connecting line beside a `title`, optional
 * `meta` and `description`, and arbitrary children for richer content. The `variant`
 * (`complete` / `current` / `upcoming`) conveys the event's state through its marker.
 *
 * @summary Single timeline event.
 */
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
          "grid grid-cols-[auto_1fr] gap-x-4 sm:gap-x-6",
          className
        )}
        {...props}
      >
        <div
          className="flex flex-col items-center gap-2 px-1 pb-2"
          aria-hidden="true"
        >
          <div className={cn("flex-shrink-0", markerVariants({ variant }))} />
          {showBottomLine && (
            <div className={cn("flex-1", lineVariants({ variant }))} />
          )}
        </div>
        <div className="flex flex-col gap-1 pb-4">
          {title && <div className="heading-sm text-foreground">{title}</div>}
          {meta && (
            <div className="text-xs font-medium text-muted-foreground">
              {meta}
            </div>
          )}
          {description && (
            <div className="text-sm text-muted-foreground">{description}</div>
          )}
          {children && <div className="mt-2">{children}</div>}
        </div>
      </div>
    );
  }
);
TimelineItem.displayName = "TimelineItem";

Timeline.displayName = "Timeline";
Timeline.Item = TimelineItem;

export { Timeline, TimelineItem };
