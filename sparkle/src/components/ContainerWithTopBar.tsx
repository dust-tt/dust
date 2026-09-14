import { cn } from "@sparkle/lib/utils";
import React, { type ReactNode } from "react";

export interface ContainerWithTopBarProps {
  children: ReactNode;
  /** Content of the sticky bar rendered above children — typically a toolbar of grouped controls. */
  topBar: ReactNode;
  /** Renders the container border in the warning color to signal an error state. */
  error?: boolean;
  className?: string;
}

/**
 * Bordered container with a sticky top bar and focus states.
 * Use for editors, forms, or any content that needs a toolbar header.
 *
 * @example
 * ```tsx
 * <ContainerWithTopBar
 *   topBar={<MyToolbar />}
 *   error={hasError}
 * >
 *   <EditorContent editor={editor} />
 * </ContainerWithTopBar>
 * ```
 */
export function ContainerWithTopBar({
  children,
  topBar,
  error = false,
  className,
}: ContainerWithTopBarProps) {
  return (
    <div
      className={cn(
        "flex w-full flex-col",
        "rounded-xl border bg-muted-background transition-all duration-200",
        "border-border",
        "focus-within:border-border-focus",
        "focus-within:outline-hidden focus-within:ring-2",
        "focus-within:ring-highlight/20",
        "min-h-40",
        error && "border-warning-500",
        className
      )}
    >
      <div
        className={cn(
          "sticky top-0 z-10 flex items-center rounded-t-xl",
          "border-b border-border",
          "bg-muted-background/80 backdrop-blur-sm"
        )}
      >
        {topBar}
      </div>
      {children}
    </div>
  );
}
