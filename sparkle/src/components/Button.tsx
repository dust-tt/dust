import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import {
  Icon,
  Spinner,
  TooltipContent,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from "@sparkle/components";
import { SpinnerProps } from "@sparkle/components/Spinner";
import { ChevronDownIcon } from "@sparkle/icons";
import { cn } from "@sparkle/lib/utils";

const BUTTON_VARIANTS = [
  "primary",
  "highlight",
  "warning",
  "outline",
  "ghost",
  "white",
] as const;

export type ButtonVariantType = (typeof BUTTON_VARIANTS)[number];

const BUTTON_SIZES = ["xs", "sm", "md"] as const;

type ButtonSizeType = (typeof BUTTON_SIZES)[number];

const styleVariants: Record<ButtonVariantType, string> = {
  primary:
    "s-bg-primary s-text-white hover:s-bg-primary-light active:s-bg-primary-dark disabled:s-bg-primary-muted",
  highlight:
    "s-bg-highlight s-text-white hover:s-bg-highlight-light active:s-bg-highlight-dark disabled:s-bg-highlight-muted",
  warning:
    "s-bg-warning s-text-white hover:s-bg-warning-light active:s-bg-warning-dark disabled:s-bg-warning-muted",
  outline:
    "s-border s-text-primary-dark s-border-border-dark hover:s-text-primary hover:s-bg-primary-100 hover:s-border-primary-200 active:s-bg-primary-300 disabled:s-text-primary-muted disabled:s-border-structure-100",
  ghost:
    "s-border s-border-primary-200/0 s-text-primary-950 hover:s-bg-primary-100 hover:s-text-primary-900 active:s-bg-primary-200 hover:s-border-primary-200 disabled:s-text-primary-400",
  white:
    "s-bg-white s-text-primary-dark s-border s-border-border-dark hover:s-bg-primary-100 hover:s-border-primary-200 active:s-bg-primary-300 disabled:s-text-primary-muted",
};

const sizeVariants: Record<ButtonSizeType, string> = {
  xs: "s-h-7 s-px-2.5 s-rounded-lg s-text-xs s-gap-1.5",
  sm: "s-h-9 s-px-3 s-rounded-xl s-text-sm s-gap-2",
  md: "s-h-12 s-px-4 s-py-2 s-rounded-2xl s-text-base s-gap-2.5",
};

const buttonVariants = cva(
  "s-inline-flex s-items-center s-justify-center s-whitespace-nowrap s-font-medium s-ring-offset-background s-transition-colors " +
    "focus-visible:s-outline-none focus-visible:s-ring-2 focus-visible:s-ring-ring focus-visible:s-ring-offset-2 " +
    "disabled:s-pointer-events-none",
  {
    variants: {
      variant: styleVariants,
      size: sizeVariants,
    },
  }
);

type SpinnerVariant = NonNullable<SpinnerProps["variant"]>;

const spinnerVariantsMap: Record<ButtonVariantType, SpinnerVariant> = {
  primary: "light",
  highlight: "light",
  warning: "light",
  outline: "dark",
  ghost: "dark",
  white: "light",
};

const spinnerVariantsMapIsLoading: Record<ButtonVariantType, SpinnerVariant> = {
  primary: "light",
  highlight: "light",
  warning: "light",
  white: "light",
  outline: "slate400",
  ghost: "slate400",
};

interface MetaButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  variant?: ButtonVariantType | null;
}

const MetaButton = React.forwardRef<HTMLButtonElement, MetaButtonProps>(
  (
    { className, variant, size = "sm", asChild = false, children, ...props },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        className={cn(variant && buttonVariants({ variant, size }), className)}
        ref={ref}
        {...props}
      >
        {children}
      </Comp>
    );
  }
);
MetaButton.displayName = "MetaButton";

export interface ButtonProps extends MetaButtonProps {
  label?: string;
  icon?: React.ComponentType;
  isSelect?: boolean;
  isLoading?: boolean;
  isPulsing?: boolean;
  tooltip?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      label,
      icon,
      isLoading = false,
      variant = "primary",
      tooltip,
      isSelect = false,
      isPulsing = false,
      size,
      "aria-label": ariaLabel,
      ...props
    },
    ref
  ) => {
    const buttonSize = size || "sm";
    const spinnerVariant = isLoading
      ? (variant && spinnerVariantsMapIsLoading[variant]) || "slate400"
      : (variant && spinnerVariantsMap[variant]) || "slate400";

    const renderIcon = (visual: React.ComponentType, extraClass = "") => (
      <Icon visual={visual} size={buttonSize} className={extraClass} />
    );

    const content = (
      <>
        {isLoading ? (
          <div className="-s-mx-0.5">
            <Spinner size={buttonSize} variant={spinnerVariant} />
          </div>
        ) : (
          icon && renderIcon(icon, "-s-mx-0.5")
        )}
        {label}
        {isSelect && renderIcon(ChevronDownIcon, isLoading ? "" : "-s-mr-1")}
      </>
    );

    const buttonElement = (
      <MetaButton
        ref={ref}
        size={buttonSize}
        variant={variant}
        disabled={isLoading || props.disabled}
        className={isPulsing ? "s-animate-pulse" : ""}
        aria-label={ariaLabel || tooltip || label}
        style={
          {
            "--pulse-color": "#93C5FD",
            "--duration": "1.5s",
          } as React.CSSProperties
        }
        {...props}
      >
        {content}
      </MetaButton>
    );

    return tooltip ? (
      <TooltipProvider>
        <TooltipRoot>
          <TooltipTrigger asChild ref={ref}>
            {buttonElement}
          </TooltipTrigger>
          <TooltipContent>{tooltip}</TooltipContent>
        </TooltipRoot>
      </TooltipProvider>
    ) : (
      buttonElement
    );
  }
);

export { Button, buttonVariants, MetaButton };
