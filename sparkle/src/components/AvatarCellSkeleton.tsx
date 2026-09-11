import { LoadingBlock } from "@sparkle/components/LoadingBlock";
import { cn } from "@sparkle/lib/utils";
import React from "react";

export interface AvatarCellSkeletonProps {
  /** Compose the cell's text or other content with TextCellSkeleton or LoadingBlock. */
  children: React.ReactNode;
  /** Use a circular user avatar instead of a square agent avatar. Defaults to false. */
  rounded?: boolean;
  /** Override the cell layout, e.g. `h-9` to reserve a two-line member name. */
  className?: string;
  /** Match a different avatar size, e.g. `h-9 w-9 rounded-lg` for a small agent avatar. */
  avatarClassName?: string;
}

/**
 * An avatar beside custom placeholder content. The 28px avatar and 8px gap match
 * DataTable.CellContent. Use rounded for user avatars and leave it false for
 * agent avatars. Supply the text lines explicitly to match the column's content.
 */
export function AvatarCellSkeleton({
  children,
  rounded = false,
  className,
  avatarClassName,
}: AvatarCellSkeletonProps) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2", className)}>
      <LoadingBlock
        className={cn(
          "h-7 w-7 shrink-0",
          rounded ? "rounded-full" : "rounded-md",
          avatarClassName
        )}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">{children}</div>
    </div>
  );
}
