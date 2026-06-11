import { cn } from "@sparkle/lib/utils";
import { cva } from "class-variance-authority";
import React from "react";

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
    "s:flex s:w-full s:px-3 s:py-2 s:text-sm",
    "s:text-foreground s:dark:text-foreground-night",
    "s:bg-muted-background s:dark:bg-muted-background-night",
    "s:placeholder:text-muted-foreground s:dark:placeholder:text-muted-foreground-night",
    "s:ring-offset-background",
    "s:border s:rounded-xl s:transition s:duration-100 s:focus-visible:outline-hidden",
    "s:focus-visible:border-border s:dark:focus-visible:border-border-night s:focus-visible:ring"
  ),
  {
    variants: {
      resize: {
        none: "s:resize-none",
        vertical: "s:resize-y",
        horizontal: "s:resize-x",
        both: "s:resize",
      },
      error: {
        true: cn(
          "s:border-border-warning/30 s:dark:border-border-warning-night/60",
          "s:ring-warning/0 s:dark:ring-warning-night/0",
          "s:focus-visible:border-border-warning s:dark:focus-visible:border-border-warning-night",
          "s:focus-visible:outline-hidden s:focus-visible:ring-2",
          "s:focus-visible:ring-warning/10 s:dark:focus-visible:ring-warning/30"
        ),
        false: cn(
          "s:border-border s:dark:border-border-night",
          "s:ring-highlight/0 s:dark:ring-highlight-night/0",
          "s:focus-visible:border-border-focus s:dark:focus-visible:border-border-focus-night",
          "s:focus-visible:outline-hidden s:focus-visible:ring-2",
          "s:focus-visible:ring-highlight/20 s:dark:focus-visible:ring-highlight/50"
        ),
      },
      disabled: {
        true: cn(
          "s:disabled:cursor-not-allowed",
          "s:disabled:text-muted-foreground s:dark:disabled:text-muted-foreground-night"
        ),
        false: "",
      },
      isDisplay: {
        true: "s:cursor-default",
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
      <div className="s:flex s:flex-col s:gap-1 s:p-px">
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
          <div className="s:ml-2 s:text-xs s:text-warning-500 s:dark:text-warning-500-night">
            {error}
          </div>
        )}
      </div>
    );
  }
);
TextArea.displayName = "TextArea";

const ReadOnlyTextArea = ({
  content,
  minRows = 10,
}: {
  content: string | null;
  minRows?: number;
}) => {
  return (
    <TextArea
      disabled
      isDisplay
      minRows={minRows}
      className={cn(
        "s:copy-sm s:h-full s:min-h-60 s:w-full s:min-w-0 s:rounded-xl",
        "s:resize-none s:border-border s:bg-muted-background",
        "s:dark:border-border-night s:dark:bg-muted-background-night"
      )}
      defaultValue={content ?? ""}
    />
  );
};

export { ReadOnlyTextArea, TextArea };
