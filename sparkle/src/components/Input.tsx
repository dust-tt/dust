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

const inputStyleClasses = cn(
  "s-text-sm s-bg-background s-rounded-xl s-border s-border-border-dark s-flex s-h-9 s-w-full s-px-3 s-py-1.5 ",
  "file:s-border-0 file:s-bg-transparent file:s-text-sm file:s-font-medium file:s-text-foreground",
  "placeholder:s-text-muted-foreground",
  "focus-visible:s-outline-none focus-visible:s-ring-2 focus-visible:s-ring-offset-2 focus-visible:s-ring-ring focus-visible:s-border-primary-400",
  "disabled:s-cursor-not-allowed disabled:s-opacity-50 disabled:s-text-muted-foreground"
);

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    { className, error, value, label, showErrorLabel = false, ...props },
    ref
  ) => {
    return (
      <div className="s-flex s-flex-col s-gap-1 s-px-1">
        {label && (
          <Label
            htmlFor={props.name}
            className="s-pb-1 s-text-element-700 dark:s-text-element-700-dark"
          >
            {label}
          </Label>
        )}
        <input
          ref={ref}
          className={cn(
            inputStyleClasses,
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
          data-1p-ignore={props.type !== "password"}
          value={value ?? undefined}
          {...props}
        />
        <div className="s-ml-2 s-text-sm s-text-warning-500">
          {showErrorLabel && error ? error : null}
        </div>
      </div>
    );
  }
);

Input.displayName = "Input";
