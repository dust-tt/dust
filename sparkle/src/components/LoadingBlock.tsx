import { cn } from "@sparkle/lib/utils";
import * as React from "react";

/**
 * A skeleton placeholder that pulses a translucent tint while content loads,
 * sized and shaped entirely through `className` (e.g. `h-4 w-[250px]`,
 * `rounded-full`). Use it to reserve space for content whose shape is known
 * ahead of time, composing several blocks to mirror the loading layout; for an
 * indeterminate wait with no known layout, use Spinner instead.
 *
 * @summary Pulsing skeleton placeholder.
 */
function LoadingBlock({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-opacity-pulse rounded-md",
        "bg-loading",
        className
      )}
      {...props}
    />
  );
}

export { LoadingBlock };
