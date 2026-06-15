import { Icon } from "@sparkle/components/Icon";
import { InfoCircle } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import { cva } from "class-variance-authority";
import React, { forwardRef } from "react";
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
  containerClassName?: string;
  label?: string;
}

const INPUT_STATES = ["error", "disabled", "default"];

type InputStateType = (typeof INPUT_STATES)[number];

const messageVariantStyles: Record<MessageStatus, string> = {
  info: "s:text-muted-foreground",
  default: "s:text-muted-foreground",
  error: "s:text-foreground-warning",
};

const stateVariantStyles: Record<InputStateType, string> = {
  default: cn(
    "s:border-border",
    "s:ring-highlight/0",
    "s:focus-visible:border-border-focus",
    "s:focus-visible:outline-hidden s:focus-visible:ring-2",
    "s:focus-visible:ring-highlight/20"
  ),
  disabled: cn(
    "s:disabled:cursor-not-allowed",
    "s:disabled:text-muted-foreground",
    "s:disabled:border-border"
  ),
  error: cn(
    "s:border-border-warning/40",
    "s:ring-warning/0",
    "s:focus-visible:border-border-warning",
    "s:focus-visible:outline-hidden s:focus-visible:ring-2",
    "s:focus-visible:ring-warning/10"
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
    "s:text-sm s:rounded-xl s:flex s:h-9 s:w-full s:px-3 s:py-1.5",
    "s:bg-background",
    "s:border s:focus-visible:ring",
    "s:file:border-0 s:file:bg-transparent s:file:text-sm s:file:font-medium s:file:text-foreground",
    "s:placeholder:text-muted-foreground"
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
      containerClassName,
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
      <div className={cn("s:flex s:flex-col s:gap-1", containerClassName)}>
        {label && (
          <Label htmlFor={props.name} className="s:mb-1">
            {label}
          </Label>
        )}
        <input
          ref={ref}
          className={cn(
            "s:ring-inset",
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
              "s:flex s:items-center s:gap-1 s:text-xs",
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
