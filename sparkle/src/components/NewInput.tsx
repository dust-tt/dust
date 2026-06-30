import { Icon } from "@sparkle/components/Icon";
import { AlertCircle } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import { cva } from "class-variance-authority";
import React, { forwardRef } from "react";

// Redesigned input, added alongside the existing Input (which is unchanged).
// xs/sm/md = 24/32/40px. The field is a wrapper around a transparent inner
// <input> so slots and icons share one code path. All colors come from
// semantic tokens that flip on their own under `.dark`, so no `dark:` is needed.

const MESSAGE_STATUS = ["info", "default", "error"] as const;

type MessageStatus = (typeof MESSAGE_STATUS)[number];

export const NEW_INPUT_SIZES = ["xs", "sm", "md"] as const;
export type NewInputSizeType = (typeof NEW_INPUT_SIZES)[number];

const messageVariantStyles: Record<MessageStatus, string> = {
  info: "text-muted-foreground",
  default: "text-muted-foreground",
  error: "text-foreground-warning",
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
    "flex w-full items-center overflow-hidden border transition-colors",
    "bg-background"
  ),
  {
    variants: {
      size: {
        xs: "h-6 rounded-lg text-xs",
        sm: "h-8 rounded-xl text-sm tracking-[-0.28px]",
        md: "h-10 rounded-[15px] text-sm tracking-[-0.28px]",
      },
      state: {
        default: cn(
          "border-border",
          "focus-within:border-border-dark",
          // Filled (has a value): darker border, plus a muted fill while the
          // field is not focused — matches Figma's "filled" state.
          "has-[input:not(:placeholder-shown)]:border-border-dark",
          "[&:has(input:not(:placeholder-shown)):not(:focus-within)]:bg-muted"
        ),
        error: cn("border-warning-300", "focus-within:border-warning-400"),
        disabled: cn("cursor-not-allowed border-transparent", "bg-muted"),
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
    "h-full w-full min-w-0 flex-1 border-0 bg-transparent outline-hidden",
    // <input> does not inherit typography from its wrapper by default.
    "font-sans font-medium text-inherit",
    "text-foreground",
    "placeholder:text-faint",
    "disabled:cursor-not-allowed disabled:text-faint"
  ),
  {
    variants: {
      size: {
        xs: "px-2",
        sm: "px-3",
        md: "px-3",
      },
    },
    defaultVariants: {
      size: "sm",
    },
  }
);

const labelVariants = cva("pb-0.5 font-medium text-foreground", {
  variants: {
    size: {
      xs: "text-xs",
      sm: "text-sm tracking-[-0.28px]",
      md: "text-sm tracking-[-0.28px]",
    },
  },
  defaultVariants: {
    size: "sm",
  },
});

// Full-height muted box flanking the field for a unit/currency (prefix/suffix).
const slotBoxVariants = cva(
  cn("flex h-full shrink-0 items-center justify-center", "bg-muted"),
  {
    variants: {
      size: {
        xs: "w-6",
        sm: "w-8",
        md: "w-10",
      },
    },
    defaultVariants: {
      size: "sm",
    },
  }
);

const ICON_CLASSES: Record<NewInputSizeType, string> = {
  xs: "h-3 w-3",
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
};

// Inline icons sit at the same inset as the inner input's horizontal padding.
const ICON_MARGIN: Record<NewInputSizeType, { left: string; right: string }> = {
  xs: { left: "ml-2", right: "mr-2" },
  sm: { left: "ml-3", right: "mr-3" },
  md: { left: "ml-3", right: "mr-3" },
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
      <div className={cn("flex flex-col gap-1.5", containerClassName)}>
        {label && (
          <label htmlFor={props.name} className={labelVariants({ size })}>
            {label}
          </label>
        )}
        <div className={cn(fieldVariants({ size, state }), className)}>
          {prefix && <div className={slotBoxVariants({ size })}>{prefix}</div>}
          {icon && (
            <Icon
              visual={icon}
              className={cn(
                "shrink-0 text-faint",
                ICON_MARGIN[size].left,
                ICON_CLASSES[size]
              )}
            />
          )}
          <input
            ref={ref}
            className={innerInputVariants({ size })}
            data-1p-ignore={props.type !== "password"}
            value={value ?? undefined}
            disabled={disabled}
            {...props}
          />
          {iconRight && (
            <Icon
              visual={iconRight}
              className={cn(
                "shrink-0 text-faint",
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
              "flex items-start gap-0.5 text-xs",
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
