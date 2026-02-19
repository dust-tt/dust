import { cn } from "@sparkle/lib/utils";
import React, { type ReactNode } from "react";

export interface ContainerWithTopBarProps {
  children: ReactNode;
  topBar: ReactNode;
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
        "s-flex s-w-full s-flex-col",
        "s-rounded-xl s-border s-bg-muted-background dark:s-bg-muted-background-night s-transition-all s-duration-200",
        "s-border-border dark:s-border-border-night",
        "focus-within:s-border-border-focus dark:focus-within:s-border-border-focus-night",
        "focus-within:s-outline-none focus-within:s-ring-2",
        "focus-within:s-ring-highlight/20 dark:focus-within:s-ring-highlight/50",
        "s-min-h-40",
        error && "s-border-warning-500 dark:s-border-warning-500-night",
        className
      )}
    >
      <div
        className={cn(
          "s-sticky s-top-0 s-z-10 s-flex s-items-center s-rounded-t-xl",
          "s-border-b s-border-border dark:s-border-border-night",
          "s-bg-muted-background/80 s-backdrop-blur-sm dark:s-bg-muted-background-night/80"
        )}
      >
        {topBar}
      </div>
      {children}
    </div>
  );
}
