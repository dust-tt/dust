import { cva } from "class-variance-authority";
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
  isDisplay?: boolean;
}

const textAreaVariants = cva(
  cn(
    "s-flex s-w-full s-px-3 s-py-2 s-text-sm",
    "s-text-foreground dark:s-text-foreground-night",
    "s-bg-muted-background dark:s-bg-muted-background-night",
    "s-ring-offset-background",
    "s-border s-rounded-xl s-transition s-duration-100 focus-visible:s-outline-none",
    "focus-visible:s-border-border-dark focus-visible:s-ring"
  ),
  {
    variants: {
      resize: {
        none: "s-resize-none",
        vertical: "s-resize-y",
        horizontal: "s-resize-x",
        both: "s-resize",
      },
      error: {
        true: cn(
          "s-border-border-warning/30",
          "focus:s-ring-warning/10",
          "focus-visible:s-border-border-warning",
          "dark:s-ring-warning-200-night dark:focus:s-ring-warning-300-night"
        ),
        false: cn(
          "s-border-border-dark/50",
          "focus:s-ring-border-focus/10",
          "focus-visible:s-border-border-focus",
          "dark:s-ring-structure-300-night",
          "dark:focus:s-ring-highlight-200-night"
        ),
      },
      disabled: {
        true: cn(
          "disabled:s-cursor-not-allowed",
          "disabled:s-text-muted-foreground dark:disabled:s-text-muted-foreground-night"
        ),
        false: "",
      },
      isDisplay: {
        true: "s-cursor-default",
        false: "",
      },
    },
    defaultVariants: {
      resize: "both",
      error: false,
      disabled: false,
      isDisplay: false,
    },
  }
);

const TextArea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  (
    {
      className,
      resize,
      minRows = 10,
      error,
      showErrorLabel,
      disabled,
      isDisplay,
      ...props
    },
    ref
  ) => {
    return (
      <div className="s-flex s-flex-col s-gap-1 s-p-px">
        <textarea
          className={cn(
            textAreaVariants({
              resize,
              error: !!error,
              disabled,
              isDisplay,
              className,
            })
          )}
          ref={ref}
          rows={minRows}
          disabled={disabled}
          {...props}
        />
        {error && showErrorLabel && (
          <div className="s-ml-2 s-text-xs s-text-warning-500">{error}</div>
        )}
      </div>
    );
  }
);
TextArea.displayName = "TextArea";

export { TextArea };
