import { Icon } from "@sparkle/components/Icon";
import { InfoCircle } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import { cva } from "class-variance-authority";
import React, { forwardRef } from "react";

// New input design (Figma "Product - WIP" > Controls & input > Input).
// Mirrors the legacy Input API so swapping is an import change; adds the new
// xs/sm/md size scale (24/32/40px — the legacy 36px input maps to "sm") and
// prefix/suffix slots. The field is a styled wrapper with a transparent inner
// input so slots and icons share one code path. Night-mode styles are
// provisional: the redesign only covers light mode so far.

const MESSAGE_STATUS = ["info", "default", "error"] as const;

type MessageStatus = (typeof MESSAGE_STATUS)[number];

export const INPUT_SIZES = ["xs", "sm", "md"] as const;
export type InputSizeType = (typeof INPUT_SIZES)[number];

const messageVariantStyles: Record<MessageStatus, string> = {
  info: "s-text-muted-foreground dark:s-text-muted-foreground-night",
  default: "s-text-muted-foreground dark:s-text-muted-foreground-night",
  error: "s-text-foreground-warning dark:s-text-foreground-warning-night",
};

const messageVariant = cva("", {
  variants: {
    status: messageVariantStyles,
  },
  defaultVariants: {
    status: "info",
  },
});

const fieldVariants = cva(
  cn(
    "s-flex s-w-full s-items-center s-overflow-hidden s-border s-transition-colors",
    "s-bg-background dark:s-bg-background-night"
  ),
  {
    variants: {
      size: {
        xs: "s-h-6 s-rounded-lg s-text-xs",
        sm: "s-h-8 s-rounded-xl s-text-sm",
        md: "s-h-10 s-rounded-[15px] s-text-sm",
      },
      state: {
        default: cn(
          "s-border-border dark:s-border-border-night",
          "focus-within:s-border-border-dark dark:focus-within:s-border-border-dark-night"
        ),
        error: cn(
          "s-border-warning-300 dark:s-border-warning-300-night",
          "focus-within:s-border-warning-400 dark:focus-within:s-border-warning-400-night"
        ),
        disabled: cn(
          "s-cursor-not-allowed s-border-transparent",
          "s-bg-gray-50 dark:s-bg-gray-900"
        ),
      },
    },
    defaultVariants: {
      size: "sm",
      state: "default",
    },
  }
);

const innerInputVariants = cva(
  cn(
    "s-h-full s-w-full s-min-w-0 s-flex-1 s-border-0 s-bg-transparent s-outline-none",
    // <input> does not inherit typography from its wrapper by default.
    "s-font-sans s-text-inherit",
    "s-text-foreground dark:s-text-foreground-night",
    "placeholder:s-text-faint dark:placeholder:s-text-faint-night",
    "disabled:s-cursor-not-allowed disabled:s-text-faint dark:disabled:s-text-faint-night"
  ),
  {
    variants: {
      size: {
        xs: "s-px-2",
        sm: "s-px-3",
        md: "s-px-3",
      },
    },
    defaultVariants: {
      size: "sm",
    },
  }
);

const labelVariants = cva(
  "s-pb-0.5 s-font-medium s-text-foreground dark:s-text-foreground-night",
  {
    variants: {
      size: {
        xs: "s-text-xs",
        sm: "s-text-sm s-tracking-[-0.28px]",
        md: "s-text-sm s-tracking-[-0.28px]",
      },
    },
    defaultVariants: {
      size: "sm",
    },
  }
);

// Square boxes flanking the field (e.g. a unit, currency or action) — same
// height as the field, muted background.
const slotBoxVariants = cva(
  cn(
    "s-flex s-h-full s-shrink-0 s-items-center s-justify-center",
    "s-bg-gray-50 dark:s-bg-gray-900"
  ),
  {
    variants: {
      size: {
        xs: "s-w-6",
        sm: "s-w-8",
        md: "s-w-10",
      },
    },
    defaultVariants: {
      size: "sm",
    },
  }
);

const ICON_CLASSES: Record<InputSizeType, string> = {
  xs: "s-h-3 s-w-3",
  sm: "s-h-3.5 s-w-3.5",
  md: "s-h-4 s-w-4",
};

export interface InputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "size" | "prefix"
  > {
  size?: InputSizeType;
  message?: string | null;
  messageStatus?: MessageStatus;
  value?: string | null;
  isError?: boolean;
  className?: string;
  containerClassName?: string;
  fieldClassName?: string;
  label?: string;
  icon?: React.ComponentType;
  iconRight?: React.ComponentType;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      containerClassName,
      fieldClassName,
      size = "sm",
      message,
      messageStatus,
      value,
      label,
      isError,
      disabled,
      icon,
      iconRight,
      prefix,
      suffix,
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
          <label htmlFor={props.name} className={labelVariants({ size })}>
            {label}
          </label>
        )}
        <div className={cn(fieldVariants({ size, state }), fieldClassName)}>
          {prefix && <div className={slotBoxVariants({ size })}>{prefix}</div>}
          {icon && (
            <Icon
              visual={icon}
              className={cn(
                "s-ml-2 s-shrink-0 s-text-faint dark:s-text-faint-night",
                ICON_CLASSES[size]
              )}
            />
          )}
          <input
            ref={ref}
            className={cn(innerInputVariants({ size }), className)}
            data-1p-ignore={props.type !== "password"}
            value={value ?? undefined}
            disabled={disabled}
            {...props}
          />
          {iconRight && (
            <Icon
              visual={iconRight}
              className={cn(
                "s-mr-2 s-shrink-0 s-text-faint dark:s-text-faint-night",
                ICON_CLASSES[size]
              )}
            />
          )}
          {suffix && <div className={slotBoxVariants({ size })}>{suffix}</div>}
        </div>
        {message && (
          <div
            className={cn(
              "s-flex s-items-center s-gap-1 s-text-xs",
              messageVariant({ status: messageStatus })
            )}
          >
            {(messageStatus === "info" || messageStatus === "error") && (
              <Icon visual={InfoCircle} size="xs" />
            )}
            {message}
          </div>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
