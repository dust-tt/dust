import { Icon } from "@sparkle/components/Icon";
import { InfoCircle } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import { cva } from "class-variance-authority";
import React, { forwardRef } from "react";
import { Label } from "./Label";

const MESSAGE_STATUS = ["info", "default", "error"] as const;

type MessageStatus = (typeof MESSAGE_STATUS)[number];

// Mirrors the Button size scale so inputs can sit next to buttons of the same
// size. `sm` is the default and matches the historical input dimensions.
export const INPUT_SIZES = ["xs", "sm", "md"] as const;

type InputSizeType = (typeof INPUT_SIZES)[number];

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "size"> {
  message?: string | null;
  messageStatus?: MessageStatus;
  value?: string | null;
  isError?: boolean;
  className?: string;
  containerClassName?: string;
  label?: string;
  size?: InputSizeType;
}

const INPUT_STATES = ["error", "disabled", "default"];

type InputStateType = (typeof INPUT_STATES)[number];

const messageVariantStyles: Record<MessageStatus, string> = {
  info: "s-text-muted-foreground dark:s-text-muted-foreground-night",
  default: "s-text-muted-foreground dark:s-text-muted-foreground-night",
  error: "s-text-foreground-warning dark:s-text-foreground-warning-night",
};

const stateVariantStyles: Record<InputStateType, string> = {
  default: cn(
    "s-border-border dark:s-border-border-night",
    "s-ring-highlight/0 dark:s-ring-highlight-night/0",
    "focus-visible:s-border-border-focus dark:focus-visible:s-border-border-focus-night",
    "focus-visible:s-outline-none focus-visible:s-ring-2",
    "focus-visible:s-ring-highlight/20 dark:focus-visible:s-ring-highlight/50"
  ),
  disabled: cn(
    "disabled:s-cursor-not-allowed",
    "disabled:s-text-muted-foreground dark:disabled:s-text-muted-foreground-night",
    "disabled:s-border-border dark:disabled:s-border-border-night"
  ),
  error: cn(
    "s-border-border-warning/40 dark:s-border-border-warning-night/60",
    "s-ring-warning/0 dark:s-ring-warning-night/0",
    "focus-visible:s-border-border-warning dark:focus-visible:s-border-border-warning-night",
    "focus-visible:s-outline-none focus-visible:s-ring-2",
    "focus-visible:s-ring-warning/10 dark:focus-visible:s-ring-warning/30"
  ),
};

const messageVariant = cva("", {
  variants: {
    status: messageVariantStyles,
  },
  defaultVariants: {
    status: "info",
  },
});

const sizeVariantStyles: Record<InputSizeType, string> = {
  xs: "s-h-7 s-rounded-lg s-px-2.5 s-py-1 s-text-xs",
  sm: "s-h-9 s-rounded-xl s-px-3 s-py-1.5 s-text-sm",
  md: "s-h-12 s-rounded-2xl s-px-4 s-py-2 s-text-base",
};

const inputStyleClasses = cva(
  cn(
    "dark:s-text-primary-50",
    "s-flex s-w-full",
    "s-bg-muted-background dark:s-bg-muted-background-night",
    "s-border focus-visible:s-ring",
    "file:s-border-0 file:s-bg-transparent file:s-text-sm file:s-font-medium file:s-text-foreground",
    "placeholder:s-text-muted-foreground dark:placeholder:s-text-muted-foreground-night"
  ),
  {
    variants: {
      state: stateVariantStyles,
      size: sizeVariantStyles,
    },
    defaultVariants: {
      state: "default",
      size: "sm",
    },
  }
);

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      containerClassName,
      message,
      messageStatus,
      value,
      label,
      isError,
      disabled,
      size = "sm",
      ...props
    },
    ref
  ) => {
    const state =
      isError || (message && messageStatus === "error")
        ? "error"
        : disabled
          ? "disabled"
          : "default";
    return (
      <div className={cn("s-flex s-flex-col s-gap-1", containerClassName)}>
        {label && (
          <Label htmlFor={props.name} className="s-mb-1">
            {label}
          </Label>
        )}
        <input
          ref={ref}
          className={cn(
            "s-ring-inset",
            inputStyleClasses({ state, size }),
            className
          )}
          data-1p-ignore={props.type !== "password"}
          value={value ?? undefined}
          disabled={disabled}
          {...props}
        />
        {message && (
          <div
            className={cn(
              "s-flex s-items-center s-gap-1 s-text-xs",
              messageVariant({ status: messageStatus })
            )}
          >
            {messageStatus === "info" && <Icon visual={InfoCircle} size="xs" />}
            {message}
          </div>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
