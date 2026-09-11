import { LoadingBlock } from "@sparkle/components/LoadingBlock";
import { cn } from "@sparkle/lib/utils";
import React from "react";

export interface TextCellSkeletonProps {
  /** Match the text width and alignment, e.g. `w-40` or `ml-auto w-16`. */
  className?: string;
}

/**
 * A text-line placeholder for a table cell. Defaults to 96px wide and 12px high,
 * capped at the available width. Compose multiple lines for names and descriptions;
 * keep their widths and spacing next to the table's loaded cell renderer.
 */
export function TextCellSkeleton({ className }: TextCellSkeletonProps) {
  return <LoadingBlock className={cn("h-3 w-24 max-w-full", className)} />;
}
