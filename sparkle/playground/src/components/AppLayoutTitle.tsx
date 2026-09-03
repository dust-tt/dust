import { cn } from "@dust-tt/sparkle";
import type React from "react";

/**
 * Mirrors front's `components/sparkle/AppLayoutTitle.tsx`.
 *
 * Production uses the `h-title` utility (3rem, declared in front's
 * `theme-extras.css`). The playground has no such utility, so the literal
 * `h-12` is used instead — same height.
 */
export function AppLayoutTitle({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "h-12",
        "flex w-full shrink-0 flex-col border-b border-separator px-4",
        "bg-panel-background",
        className
      )}
    >
      {children}
    </div>
  );
}
