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
    "flex w-full px-3 py-2 text-sm",
    "text-foreground",
    "bg-muted-background",
    "placeholder:text-muted-foreground",
    "ring-offset-background",
    "border border-border rounded-xl transition duration-100 focus-visible:outline-hidden",
    "focus-visible:border-border focus-visible:ring"
  ),
  {
    variants: {
      resize: {
        none: "resize-none",
        vertical: "resize-y",
        horizontal: "resize-x",
        both: "resize",
      },
      error: {
        true: cn(
          "border-border-warning/30",
          "ring-warning/0",
          "focus-visible:border-border-warning",
          "focus-visible:outline-hidden focus-visible:ring-2",
          "focus-visible:ring-warning/10"
        ),
        false: cn(
          "border-border",
          "ring-highlight/0",
          "focus-visible:border-border-focus",
          "focus-visible:outline-hidden focus-visible:ring-2",
          "focus-visible:ring-highlight/20"
        ),
      },
      disabled: {
        true: cn(
          "disabled:cursor-not-allowed",
          "disabled:text-muted-foreground"
        ),
        false: "",
      },
      isDisplay: {
        true: "cursor-default",
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
      <div className="flex flex-col gap-1 p-px">
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
          <div className="ml-2 text-xs text-warning-500">{error}</div>
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
        "copy-sm h-full min-h-60 w-full min-w-0 rounded-xl",
        "resize-none border-border bg-muted-background"
      )}
      defaultValue={content ?? ""}
    />
  );
};

export { ReadOnlyTextArea, TextArea };
