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

export const INPUT_SIZES = ["xs", "sm", "md"] as const;
export type InputSizeType = (typeof INPUT_SIZES)[number];

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
          "border-border-form",
          "focus-within:border-border-form-active",
          // Filled (has a value): darker border, plus a muted fill while the
          // field is not focused — matches Figma's "filled" state.
          "has-[input:not(:placeholder-shown)]:border-border-form-active",
          "[&:has(input:not(:placeholder-shown)):not(:focus-within)]:bg-muted"
        ),
        error: cn("border-warning-500", "focus-within:border-warning-600"),
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
    "h-full w-full min-w-0 flex-1 border-0 bg-transparent outline-hidden shadow-none ring-0",
    // <input> does not inherit typography from its wrapper by default.
    "font-sans text-inherit",
    "text-foreground",
    "placeholder:text-faint",
    "disabled:cursor-not-allowed disabled:text-faint"
  ),
  {
    variants: {
      size: {
        xs: "px-2 text-xs",
        sm: "px-3 text-sm",
        md: "px-3 text-sm",
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
// Sized to its content with a floor, so a word ("days") is not clipped by the
// field's overflow-hidden while a single glyph ("$") keeps its square box.
const slotBoxVariants = cva(
  cn("flex h-full shrink-0 items-center justify-center", "bg-muted"),
  {
    variants: {
      size: {
        xs: "min-w-6 px-2",
        sm: "min-w-8 px-2.5",
        md: "min-w-10 px-3",
      },
    },
    defaultVariants: {
      size: "sm",
    },
  }
);

const ICON_CLASSES: Record<InputSizeType, string> = {
  xs: "h-3 w-3",
  sm: "h-3.5 w-3.5",
  md: "h-4 w-4",
};

// Inline icons sit at the same inset as the inner input's horizontal padding.
const ICON_MARGIN: Record<InputSizeType, { left: string; right: string }> = {
  xs: { left: "ml-2", right: "mr-2" },
  sm: { left: "ml-3", right: "mr-3" },
  md: { left: "ml-3", right: "mr-3" },
};

export interface InputProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "value" | "size" | "prefix"
  > {
  /** Field height: "xs" (24px), "sm" (32px), or "md" (40px); a number falls back to "sm". */
  size?: InputSizeType | number;
  /** Helper or error text shown under the field, colored by `messageStatus`. */
  message?: string | null;
  /** How the `message` is rendered: "info" and "error" show an icon, "error" also colors the field. */
  messageStatus?: MessageStatus;
  value?: string | number | readonly string[] | null;
  /** Forces the error (warning border) state regardless of `messageStatus`. */
  isError?: boolean;
  /** Classes applied to the field wrapper. */
  className?: string;
  /** Classes applied to the outer container (label + field + message). */
  containerClassName?: string;
  /** Caption rendered above the field. */
  label?: string;
  /** Icon rendered inline at the start of the field. */
  icon?: React.ComponentType;
  /** Icon rendered inline at the end of the field. */
  iconRight?: React.ComponentType;
  /** Content of a full-height muted box before the field (e.g. a unit or currency). */
  prefix?: React.ReactNode;
  /** Content of a full-height muted box after the field (e.g. a unit or currency). */
  suffix?: React.ReactNode;
  /**
   * Shorthand for a `suffix` that is just a unit/currency label (e.g.
   * "credits/month", "days"): renders it in the muted box with faint text,
   * so callers don't each re-style that text themselves. Ignored if `suffix`
   * is also provided.
   */
  unit?: React.ReactNode;
}

/**
 * A single-line text field for short, freeform input such as a name, email, or
 * search term, with an optional label, helper or error message with status
 * colouring, and the standard HTML input types. Use it to collect a short piece
 * of text or a number in forms, search bars, and settings panels; for
 * multi-line input use TextArea, for search-specific affordances use
 * SearchInput.
 *
 * @summary Single-line text field.
 */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      containerClassName,
      size: rawSize = "sm",
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
      unit,
      ...props
    },
    ref
  ) => {
    const size: InputSizeType = typeof rawSize === "number" ? "sm" : rawSize;
    const resolvedSuffix =
      suffix ??
      (unit != null ? <span className="text-faint">{unit}</span> : undefined);
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
          {resolvedSuffix && (
            <div className={slotBoxVariants({ size })}>{resolvedSuffix}</div>
          )}
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

Input.displayName = "Input";
