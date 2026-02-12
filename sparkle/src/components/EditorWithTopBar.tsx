import { cn } from "@sparkle/lib/utils";
import React, { type ReactNode } from "react";

export interface EditorWithTopBarProps {
  children: ReactNode;
  topBar: ReactNode;
  error?: boolean;
  className?: string;
}

/**
 * Container for rich text editors with a sticky top toolbar.
 * Provides a bordered container with focus states and a sticky header bar.
 *
 * @example
 * ```tsx
 * <EditorWithTopBar
 *   topBar={<MyToolbar editor={editor} />}
 *   error={hasError}
 * >
 *   <EditorContent editor={editor} />
 * </EditorWithTopBar>
 * ```
 */
export function EditorWithTopBar({
  children,
  topBar,
  error = false,
  className,
}: EditorWithTopBarProps) {
  return (
    <div
      className={cn(
        "s-flex s-w-full s-flex-col",
        "s-rounded-xl s-border s-bg-muted-background s-transition-all s-duration-200",
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
