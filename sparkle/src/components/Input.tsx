import { cva } from "class-variance-authority";
import React, { forwardRef } from "react";

import { Icon } from "@sparkle/components/Icon";
import { InformationCircleIcon } from "@sparkle/icons/app";
import { cn } from "@sparkle/lib/utils";

import { Label } from "./Label";

const MESSAGE_STATUS = ["info", "default", "error"] as const;

type MessageStatus = (typeof MESSAGE_STATUS)[number];

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value"> {
  message?: string | null;
  messageStatus?: MessageStatus;
  value?: string | null;
  isError?: boolean;
  className?: string;
  label?: string;
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
    "disabled:s-border-border dark:disabled:s-border-border-night",
    // Use muted background only when disabled
    "s-bg-muted-background dark:s-bg-muted-background-night"
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

const inputStyleClasses = cva(
  cn(
    "dark:s-text-primary-50",
    "s-text-sm s-rounded-xl s-flex s-h-9 s-w-full s-px-3 s-py-1.5 ",
    // Default to plain background; disabled state will override to muted
    "s-bg-background dark:s-bg-background-night",
    "s-border focus-visible:s-ring",
    "file:s-border-0 file:s-bg-transparent file:s-text-sm file:s-font-medium file:s-text-foreground",
    "placeholder:s-text-muted-foreground placeholder:s-italic dark:placeholder:s-text-muted-foreground-night"
  ),
  {
    variants: {
      state: stateVariantStyles,
    },
    defaultVariants: {
      state: "default",
    },
  }
);

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      message,
      messageStatus,
      value,
      label,
      isError,
      disabled,
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
      <div className="s-flex s-flex-col s-gap-1">
        {label && (
          <Label htmlFor={props.name} className="s-mb-1">
            {label}
          </Label>
        )}
        <input
          ref={ref}
          className={cn(
            "s-ring-inset",
            inputStyleClasses({ state }),
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
            {messageStatus === "info" && (
              <Icon visual={InformationCircleIcon} size="xs" />
            )}
            {message}
          </div>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
