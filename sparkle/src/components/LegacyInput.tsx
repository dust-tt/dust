import { Icon } from "@sparkle/components/Icon";
import { InfoCircle } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import { cva } from "class-variance-authority";
import React, { forwardRef } from "react";
import { Label } from "./Label";

const MESSAGE_STATUS = ["info", "default", "error"] as const;

type MessageStatus = (typeof MESSAGE_STATUS)[number];

export interface LegacyInputProps
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
  info: "text-muted-foreground",
  default: "text-muted-foreground",
  error: "text-foreground-warning",
};

const stateVariantStyles: Record<InputStateType, string> = {
  default: cn(
    "border-border",
    "ring-highlight/0",
    "focus-visible:border-border-focus",
    "focus-visible:outline-hidden focus-visible:ring-2",
    "focus-visible:ring-highlight/20"
  ),
  disabled: cn(
    "disabled:cursor-not-allowed",
    "disabled:text-muted-foreground",
    "disabled:border-border"
  ),
  error: cn(
    "border-border-warning/40",
    "ring-warning/0",
    "focus-visible:border-border-warning",
    "focus-visible:outline-hidden focus-visible:ring-2",
    "focus-visible:ring-warning/10"
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
    "text-sm rounded-xl flex h-9 w-full px-3 py-1.5",
    "text-foreground",
    "bg-background",
    "border border-border focus-visible:ring",
    "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
    "placeholder:text-muted-foreground"
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

export const LegacyInput = forwardRef<HTMLInputElement, LegacyInputProps>(
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
      <div className={cn("flex flex-col gap-1", containerClassName)}>
        {label && (
          <Label htmlFor={props.name} className="mb-1">
            {label}
          </Label>
        )}
        <input
          ref={ref}
          className={cn("ring-inset", inputStyleClasses({ state }), className)}
          data-1p-ignore={props.type !== "password"}
          value={value ?? undefined}
          disabled={disabled}
          {...props}
        />
        {message && (
          <div
            className={cn(
              "flex items-center gap-1 text-xs",
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

LegacyInput.displayName = "LegacyInput";
