import { cva } from "class-variance-authority";
import React, { forwardRef } from "react";

import { cn } from "@sparkle/lib/utils";

import { Label } from "./Label";

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value"> {
  error?: string | null;
  value?: string | null;
  showErrorLabel?: boolean;
  className?: string;
  label?: string;
}

const INPUT_STATES = ["error", "disabled", "default"];

type InputStateType = (typeof INPUT_STATES)[number];

const stateVariantStyles: Record<InputStateType, string> = {
  default: "focus-visible:s-ring-ring",
  disabled:
    "disabled:s-cursor-not-allowed disabled:s-opacity-50 disabled:s-text-muted-foreground",
  error: "s-border-border-warning focus:s-ring-ring-warning",
};
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
      error,
      value,
      label,
      disabled,
      showErrorLabel = false,
      ...props
    },
    ref
  ) => {
    const state = error ? "error" : disabled ? "disabled" : "default";
    return (
      <div className="s-flex s-flex-col s-gap-1 s-px-1">
        {label && <Label htmlFor={props.name}>{label}</Label>}
        <input
          ref={ref}
          className={cn(inputStyleClasses({ state }), className)}
          data-1p-ignore={props.type !== "password"}
          value={value ?? undefined}
          disabled={disabled}
          {...props}
        />
        {showErrorLabel && error && (
          <div className="s-ml-3.5 s-text-xs s-text-foreground-warning">
            {error}
          </div>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
