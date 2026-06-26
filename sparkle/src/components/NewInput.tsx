import { Icon } from "@sparkle/components/Icon";
import { AlertCircle } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import { cva } from "class-variance-authority";
import React, { forwardRef } from "react";

// Redesigned input, added alongside the existing Input (which is unchanged).
// xs/sm/md = 24/32/40px. The field is a wrapper around a transparent inner
// <input> so slots and icons share one code path.

const MESSAGE_STATUS = ["info", "default", "error"] as const;

type MessageStatus = (typeof MESSAGE_STATUS)[number];

export const NEW_INPUT_SIZES = ["xs", "sm", "md"] as const;
export type NewInputSizeType = (typeof NEW_INPUT_SIZES)[number];

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
        sm: "s-h-8 s-rounded-xl s-text-sm s-tracking-[-0.28px]",
        md: "s-h-10 s-rounded-[15px] s-text-sm s-tracking-[-0.28px]",
      },
      state: {
        default: cn(
          "s-border-border dark:s-border-border-night",
          "focus-within:s-border-border-dark dark:focus-within:s-border-border-dark-night",
          // Filled (has a value): darker border, plus a muted fill while the
          // field is not focused — matches Figma's "filled" state.
          "has-[input:not(:placeholder-shown)]:s-border-border-dark",
          "dark:has-[input:not(:placeholder-shown)]:s-border-border-dark-night",
          "[&:has(input:not(:placeholder-shown)):not(:focus-within)]:s-bg-muted",
          "dark:[&:has(input:not(:placeholder-shown)):not(:focus-within)]:s-bg-muted-night"
        ),
        error: cn(
          "s-border-warning-300 dark:s-border-warning-300-night",
          "focus-within:s-border-warning-400 dark:focus-within:s-border-warning-400-night"
        ),
        disabled: cn(
          "s-cursor-not-allowed s-border-transparent",
          "s-bg-muted dark:s-bg-muted-night"
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
    "s-font-sans s-font-medium s-text-inherit",
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

// Full-height muted box flanking the field for a unit/currency (prefix/suffix).
const slotBoxVariants = cva(
  cn(
    "s-flex s-h-full s-shrink-0 s-items-center s-justify-center",
    "s-bg-muted dark:s-bg-muted-night"
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

const ICON_CLASSES: Record<NewInputSizeType, string> = {
  xs: "s-h-3 s-w-3",
  sm: "s-h-3.5 s-w-3.5",
  md: "s-h-4 s-w-4",
};

// Inline icons sit at the same inset as the inner input's horizontal padding.
const ICON_MARGIN: Record<NewInputSizeType, { left: string; right: string }> = {
  xs: { left: "s-ml-2", right: "s-mr-2" },
  sm: { left: "s-ml-3", right: "s-mr-3" },
  md: { left: "s-ml-3", right: "s-mr-3" },
};

export interface NewInputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "size" | "prefix"
  > {
  size?: NewInputSizeType;
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

export const NewInput = forwardRef<HTMLInputElement, NewInputProps>(
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
      <div className={cn("s-flex s-flex-col s-gap-1.5", containerClassName)}>
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
                "s-shrink-0 s-text-faint dark:s-text-faint-night",
                ICON_MARGIN[size].left,
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
                "s-shrink-0 s-text-faint dark:s-text-faint-night",
                ICON_MARGIN[size].right,
                ICON_CLASSES[size]
              )}
            />
          )}
          {suffix && <div className={slotBoxVariants({ size })}>{suffix}</div>}
        </div>
        {message && (
          <div
            className={cn(
              "s-flex s-items-start s-gap-0.5 s-text-xs",
              messageVariant({ status: messageStatus })
            )}
          >
            {(messageStatus === "info" || messageStatus === "error") && (
              <Icon visual={AlertCircle} size="xs" />
            )}
            {message}
          </div>
        )}
      </div>
    );
  }
);

NewInput.displayName = "NewInput";
