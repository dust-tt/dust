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
        "s:flex s:w-full s:flex-col",
        "s:rounded-xl s:border s:bg-muted-background s:dark:bg-muted-background-night s:transition-all s:duration-200",
        "s:border-border s:dark:border-border-night",
        "s:focus-within:border-border-focus s:dark:focus-within:border-border-focus-night",
        "s:focus-within:outline-hidden s:focus-within:ring-2",
        "s:focus-within:ring-highlight/20 s:dark:focus-within:ring-highlight/50",
        "s:min-h-40",
        error && "s:border-warning-500 s:dark:border-warning-500-night",
        className
      )}
    >
      <div
        className={cn(
          "s:sticky s:top-0 s:z-10 s:flex s:items-center s:rounded-t-xl",
          "s:border-b s:border-border s:dark:border-border-night",
          "s:bg-muted-background/80 s:backdrop-blur-sm s:dark:bg-muted-background-night/80"
        )}
      >
        {topBar}
      </div>
      {children}
    </div>
  );
}
