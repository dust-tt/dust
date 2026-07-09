import { Slot } from "@radix-ui/react-slot";
import type { LinkWrapperProps } from "@sparkle/components/LinkWrapper";
import {
  NewButton,
  type NewButtonSizeType,
  type NewButtonVariantType,
} from "@sparkle/components/NewButton";
import { cn } from "@sparkle/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

// Preview-branch shim: delegates Button → NewButton.
// Keeps all old type exports so existing import sites don't break.

// ── Variant / size mapping ────────────────────────────────────────────────────

function mapButtonVariant(v: ButtonVariantType): NewButtonVariantType {
  switch (v) {
    case "highlight-secondary":
      return "highlight-ghost";
    case "warning-secondary":
      return "warning-ghost";
    default:
      return v;
  }
}

function mapButtonSize(s: ButtonSize): NewButtonSizeType {
  switch (s) {
    case "xmini":
    case "mini":
    case "icon-xs":
    case "xs":
      return "xs";
    case "icon":
    case "sm":
      return "sm";
    case "icon-sm":
    case "md":
      return "md";
  }
}

// ── Type exports (kept for backward compat) ───────────────────────────────────

export const BUTTON_VARIANTS = [
  "primary",
  "highlight",
  "highlight-secondary",
  "warning",
  "warning-secondary",
  "outline",
  "ghost",
  "ghost-secondary",
] as const;

export type ButtonVariantType = (typeof BUTTON_VARIANTS)[number];

export const REGULAR_BUTTON_SIZES = [
  "xmini",
  "mini",
  "xs",
  "sm",
  "md",
] as const;
export const ICON_ONLY_SIZES = ["icon-xs", "icon", "icon-sm"] as const;
export const SMALL_BUTTON_SIZES = ["icon-xs", "icon", "xmini", "mini"] as const;

export type RegularButtonSize = (typeof REGULAR_BUTTON_SIZES)[number];
export type IconOnlySize = (typeof ICON_ONLY_SIZES)[number];
export type ButtonSize = RegularButtonSize | IconOnlySize;

// ── MetaButton (kept for backward compat — some consumers import it) ──────────

const buttonVariants = cva(
  cn(
    "inline-flex items-center justify-center whitespace-nowrap ring-offset-background transition-colors ring-inset select-none",
    "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
  ),
  {
    variants: {
      variant: {
        primary: "border border-transparent bg-primary-800 text-primary-50",
        highlight: "border border-transparent bg-highlight text-highlight-on",
        "highlight-secondary":
          "border border-border text-highlight-500 bg-background",
        warning: "border border-transparent bg-warning text-warning-on",
        "warning-secondary":
          "border border-border text-warning-500 bg-background",
        outline: "border border-border text-primary bg-background",
        ghost: "border border-transparent text-foreground",
        "ghost-secondary": "border border-transparent text-muted-foreground",
      },
      size: {
        "icon-xs": "h-6 w-6 gap-1 shrink-0",
        icon: "h-7 w-7 gap-1.5 shrink-0",
        "icon-sm": "h-9 w-9 gap-2 shrink-0",
        xmini: "h-6 px-1.5 gap-1 shrink-0",
        mini: "h-7 px-2 gap-1.5 shrink-0",
        xs: "h-7 px-2.5 gap-1.5 shrink-0",
        sm: "h-9 px-3 gap-2 shrink-0",
        md: "h-12 px-4 py-2 gap-2.5 shrink-0",
      },
      rounded: {
        "icon-xs": "rounded-lg",
        icon: "rounded-lg",
        "icon-sm": "rounded-xl",
        xmini: "rounded-lg",
        mini: "rounded-lg",
        xs: "rounded-lg",
        sm: "rounded-xl",
        md: "rounded-2xl",
        full: "rounded-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "sm",
      rounded: "sm",
    },
  }
);

export interface MetaButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  isRounded?: boolean;
}

const MetaButton = React.forwardRef<HTMLButtonElement, MetaButtonProps>(
  (
    {
      className,
      asChild = false,
      variant,
      size,
      isRounded,
      children,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";
    const rounded = isRounded ? "full" : size;
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, rounded, className }))}
        ref={ref}
        {...props}
      >
        {children}
      </Comp>
    );
  }
);
MetaButton.displayName = "MetaButton";

export const ICON_SIZE_MAP: Record<ButtonSize, "xs" | "sm" | "md"> = {
  "icon-xs": "xs",
  icon: "sm",
  "icon-sm": "sm",
  xmini: "xs",
  mini: "sm",
  xs: "xs",
  sm: "sm",
  md: "md",
};

// ── Props types ───────────────────────────────────────────────────────────────

type CommonButtonProps = Omit<MetaButtonProps, "children"> &
  Omit<LinkWrapperProps, "children"> & {
    isSelect?: boolean;
    isLoading?: boolean;
    isPulsing?: boolean;
    briefPulse?: boolean;
    tooltip?: string;
    tooltipShortcut?: string;
    isCounter?: boolean;
    counterValue?: string;
    isRounded?: boolean;
    hasLighterFont?: boolean;
  };

export type ButtonIconType = React.ComponentType | React.ReactElement;

export type IconOnlyButtonProps = CommonButtonProps & {
  size: IconOnlySize;
  icon: ButtonIconType;
  label?: never;
};

export type RegularButtonProps = CommonButtonProps & {
  size?: RegularButtonSize;
  icon?: ButtonIconType;
  label?: string;
};

export type ButtonProps = IconOnlyButtonProps | RegularButtonProps;

// ── Shim ──────────────────────────────────────────────────────────────────────

// briefPulse, isRounded, hasLighterFont have no NewButton equivalent — silently dropped.
const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "sm",
      label,
      icon,
      isSelect,
      isLoading,
      isPulsing,
      isCounter,
      counterValue,
      tooltip,
      tooltipShortcut,
      href,
      target,
      rel,
      replace,
      shallow,
      className,
      disabled,
      "aria-label": ariaLabel,
      briefPulse: _briefPulse,
      isRounded: _isRounded,
      hasLighterFont: _hasLighterFont,
      ...htmlProps
    },
    ref
  ) => {
    return (
      <NewButton
        ref={ref}
        variant={mapButtonVariant(variant ?? "primary")}
        size={mapButtonSize(size ?? "sm")}
        label={label}
        icon={icon}
        isSelect={isSelect}
        isLoading={isLoading}
        isPulsing={isPulsing}
        isCounter={isCounter}
        counterValue={counterValue}
        tooltip={tooltip}
        tooltipShortcut={tooltipShortcut}
        href={href}
        target={target}
        rel={rel}
        replace={replace}
        shallow={shallow}
        className={className}
        disabled={disabled}
        aria-label={ariaLabel}
        {...htmlProps}
      />
    );
  }
);

Button.displayName = "Button";

export { Button, buttonVariants, MetaButton };
