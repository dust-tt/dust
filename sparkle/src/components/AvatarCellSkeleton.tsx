import { LoadingBlock } from "@sparkle/components/LoadingBlock";
import { cn } from "@sparkle/lib/utils";
import React from "react";

export interface AvatarCellSkeletonProps {
  /** Compose the cell's text or other content with TextCellSkeleton or LoadingBlock. */
  children: React.ReactNode;
  /** Override the cell layout, e.g. `h-9` to reserve a two-line member name. */
  className?: string;
  /** Match the avatar's size and shape, e.g. `rounded-lg` for a square avatar. */
  avatarClassName?: string;
}

/**
 * An avatar beside custom placeholder content. The 28px circular avatar and 8px
 * gap match DataTable.CellContent with a rounded avatar. Supply the text lines
 * explicitly so the skeleton follows the actual contents of the column.
 */
export function AvatarCellSkeleton({
  children,
  className,
  avatarClassName,
}: AvatarCellSkeletonProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <LoadingBlock
        className={cn("h-7 w-7 shrink-0 rounded-full", avatarClassName)}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">{children}</div>
    </div>
  );
}
