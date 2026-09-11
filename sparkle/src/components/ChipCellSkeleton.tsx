import { LoadingBlock } from "@sparkle/components/LoadingBlock";
import { cn } from "@sparkle/lib/utils";
import React from "react";

export interface ChipCellSkeletonProps {
  /** Match the chip width, size, and alignment, e.g. `w-20` or `h-8 rounded-xl`. */
  className?: string;
}

/**
 * A status or category placeholder matching the height and rounding of an xs Chip.
 * Set its width for the expected label; compose several for columns with multiple chips.
 */
export function ChipCellSkeleton({ className }: ChipCellSkeletonProps) {
  return (
    <LoadingBlock
      className={cn("h-6 w-16 max-w-full rounded-[9px]", className)}
    />
  );
}
