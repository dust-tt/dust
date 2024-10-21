import React from "react";

import { cn } from "@sparkle/lib/utils";

const RESIZE_DIRECTIONS = ["none", "vertical", "horizontal", "both"] as const;

type ResizeDirectionType = (typeof RESIZE_DIRECTIONS)[number];

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  resize?: ResizeDirectionType;
  error?: string | null;
  showErrorLabel?: boolean;
  minRows?: number;
}

const textAreaStyles = cn(
  "s-flex s-w-full s-px-3 s-py-2",
  "s-transition s-duration-100",
  "s-text-sm placeholder:s-text-muted-foreground s-text-foreground",
  "s-ring-offset-background s-border s-border-border-dark s-bg-background s-rounded-xl",
  "focus-visible:s-outline-none focus-visible:s-ring-2 focus-visible:s-ring-offset-2 ",
  "disabled:s-cursor-not-allowed disabled:s-opacity-50 disabled:s-text-muted-foreground"
);

const TextArea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      resize = "both",
      minRows = 10,
      error,
      showErrorLabel,
      ...props
    },
    ref
  ) => {
    const resizeClass = {
      none: "s-resize-none",
      vertical: "s-resize-y",
      horizontal: "s-resize-x",
      both: "s-resize",
    };

    return (
      <div className="s-flex s-flex-col s-gap-1 s-p-px">
        <textarea
          className={cn(
            textAreaStyles,
            resizeClass[resize],
            className,
            !error
              ? cn(
                  "s-ring-structure-200 focus:s-ring-action-300",
                  "dark:s-ring-structure-300-dark dark:focus:s-ring-action-300-dark"
                )
              : cn(
                  "s-ring-warning-200 focus:s-ring-warning-300",
                  "dark:s-ring-warning-200-dark dark:focus:s-ring-warning-300-dark"
                )
          )}
          ref={ref}
          rows={minRows}
          {...props}
        />
        {error && showErrorLabel && (
          <div className="s-ml-2 s-text-sm s-text-warning-500">{error}</div>
        )}
      </div>
    );
  }
);
TextArea.displayName = "TextArea";

export { TextArea };
