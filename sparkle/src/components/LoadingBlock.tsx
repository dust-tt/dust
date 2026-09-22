import { cn } from "@sparkle/lib/utils";
import * as React from "react";

/**
 * A skeleton placeholder: a translucent tint with a highlight sweeping across it
 * while content loads, sized and shaped entirely through `className` (e.g.
 * `h-4 w-[250px]`, `rounded-full`). Use it to reserve space for content whose
 * shape is known ahead of time, composing several blocks to mirror the loading
 * layout; for an indeterminate wait with no known layout, use Spinner instead.
 *
 * @summary Shimmering skeleton placeholder.
 */
function LoadingBlock({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-loading",
        // The sweep is a band of the surface colour, so it reads on any surface in both themes and
        // only animates transform. Blocks mounted together start in step.
        "before:pointer-events-none before:absolute before:inset-0 before:-translate-x-full",
        "before:bg-linear-to-r before:from-transparent before:via-background/80 before:to-transparent",
        "before:animate-shimmer",
        "motion-reduce:before:hidden",
        className
      )}
      {...props}
    />
  );
}

export { LoadingBlock };
