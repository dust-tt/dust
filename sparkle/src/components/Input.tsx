import { cva } from "class-variance-authority";
import React, { forwardRef } from "react";

import { Icon } from "@sparkle/components/Icon";
import { InformationCircleStrokeIcon } from "@sparkle/icons";
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
  info: "s-text-muted-foreground",
  default: "s-text-muted-foreground",
  error: "s-text-foreground-warning",
};

const stateVariantStyles: Record<InputStateType, string> = {
  default: "focus-visible:s-ring-ring",
  disabled:
    "disabled:s-cursor-not-allowed disabled:s-opacity-50 disabled:s-text-muted-foreground",
  error: "s-border-border-warning focus:s-ring-ring-warning",
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
    "s-text-sm s-bg-background s-rounded-xl s-border s-border-border-dark s-flex s-h-9 s-w-full s-px-3 s-py-1.5 ",
    "file:s-border-0 file:s-bg-transparent file:s-text-sm file:s-font-medium file:s-text-foreground",
    "placeholder:s-text-muted-foreground",
    "focus-visible:s-outline-none focus-visible:s-ring-2 focus-visible:s-ring-offset-2 focus-visible:s-border-border-dark"
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
        {label && <Label htmlFor={props.name}>{label}</Label>}
        <input
          ref={ref}
          className={cn(inputStyleClasses({ state }), className)}
          data-1p-ignore={props.type !== "password"}
          value={value ?? undefined}
          disabled={disabled}
          {...props}
        />
        {message && (
          <div
            className={cn(
              "s-ml-3.5 s-flex s-items-center s-gap-1 s-text-xs",
              messageVariant({ status: messageStatus })
            )}
          >
            {messageStatus === "info" && (
              <Icon visual={InformationCircleStrokeIcon} size="xs" />
            )}
            {message}
          </div>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
