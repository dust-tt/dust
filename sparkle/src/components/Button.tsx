import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import {
  Icon,
  LinkWrapper,
  LinkWrapperProps,
  Spinner,
  TooltipContent,
  TooltipPortal,
  TooltipProvider,
  TooltipRoot,
  TooltipTrigger,
} from "@sparkle/components/";
import { SpinnerProps } from "@sparkle/components/Spinner";
import { ChevronDownIcon } from "@sparkle/icons";
import { cn } from "@sparkle/lib/utils";

export const BUTTON_VARIANTS = [
  "primary",
  "highlight",
  "warning",
  "outline",
  "ghost",
  "ghost-secondary",
] as const;

export type ButtonVariantType = (typeof BUTTON_VARIANTS)[number];

export const BUTTON_SIZES = ["mini", "xs", "sm", "md"] as const;
export type ButtonSizeType = (typeof BUTTON_SIZES)[number];

const styleVariants: Record<ButtonVariantType, string> = {
  primary:
    "s-bg-primary dark:s-bg-primary-dark s-text-primary-50 dark:s-text-primary-50-dark hover:s-bg-primary-light dark:hover:s-bg-primary-light-dark active:s-bg-primary-dark dark:active:s-bg-primary-dark-dark disabled:s-bg-primary-muted dark:disabled:s-bg-primary-muted-dark",
  highlight:
    "s-bg-highlight dark:s-bg-highlight-dark s-text-highlight-50 dark:s-text-highlight-50-dark hover:s-bg-highlight-light dark:hover:s-bg-highlight-light-dark active:s-bg-highlight-dark dark:active:s-bg-highlight-dark-dark disabled:s-bg-highlight-muted dark:disabled:s-bg-highlight-muted-dark",
  warning:
    "s-bg-warning dark:s-bg-warning-dark s-text-warning-50 dark:s-text-warning-50-dark hover:s-bg-warning-light dark:hover:s-bg-warning-light-dark active:s-bg-warning-dark dark:active:s-bg-warning-dark-dark disabled:s-bg-warning-muted dark:disabled:s-bg-warning-muted-dark",
  outline:
    "s-border s-text-primary-dark s-bg-background dark:s-bg-background-dark s-border-border-dark hover:s-text-primary hover:s-bg-primary-150 dark:hover:s-bg-primary-150-dark hover:s-border-primary-150 dark:hover:s-border-primary-150-dark active:s-bg-primary-300 dark:active:s-bg-primary-300-dark disabled:s-text-primary-muted disabled:s-border-structure-100 dark:disabled:s-border-structure-100-dark",
  ghost:
    "s-border s-border-primary-200/0 s-text-primary-950 hover:s-bg-primary-150 dark:hover:s-bg-primary-150-dark hover:s-text-primary-900 hover:s-border-primary-150 dark:hover:s-border-primary-150-dark active:s-bg-primary-300 dark:active:s-bg-primary-300-dark disabled:s-text-primary-400 dark:disabled:s-text-primary-400-dark",
  "ghost-secondary":
    "s-border s-border-primary-200/0 s-text-muted-foreground hover:s-bg-primary-150 dark:hover:s-bg-primary-150-dark hover:s-text-primary-900 hover:s-border-primary-150 dark:hover:s-border-primary-150-dark active:s-bg-primary-300 dark:active:s-bg-primary-300-dark disabled:s-text-primary-400 dark:disabled:s-text-primary-400-dark",
};

const sizeVariants: Record<ButtonSizeType, string> = {
  mini: "s-h-7 s-p-1.5 s-rounded-lg s-text-sm s-gap-1.5",
  xs: "s-h-7 s-px-2.5 s-rounded-lg s-text-xs s-gap-1.5",
  sm: "s-h-9 s-px-3 s-rounded-xl s-text-sm s-gap-2",
  md: "s-h-12 s-px-4 s-py-2 s-rounded-2xl s-text-base s-gap-2.5",
};

const buttonVariants = cva(
  "s-inline-flex s-items-center s-justify-center s-whitespace-nowrap s-font-medium s-ring-offset-background s-transition-colors " +
    "focus-visible:s-outline-none focus-visible:s-ring-2 focus-visible:s-ring-ring focus-visible:s-ring-offset-2",
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
  "ghost-secondary": "dark",
};

const spinnerVariantsMapIsLoading: Record<ButtonVariantType, SpinnerVariant> = {
  primary: "light",
  highlight: "light",
  warning: "light",
  outline: "slate400",
  ghost: "slate400",
  "ghost-secondary": "dark",
};

export interface MetaButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  variant?: ButtonVariantType | null;
}

const MetaButton = React.forwardRef<HTMLButtonElement, MetaButtonProps>(
  ({ className, asChild = false, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp className={className} ref={ref} {...props}>
        {children}
      </Comp>
    );
  }
);
MetaButton.displayName = "MetaButton";

type CommonButtonProps = Omit<MetaButtonProps, "children"> &
  Omit<LinkWrapperProps, "children"> & {
    isSelect?: boolean;
    isLoading?: boolean;
    isPulsing?: boolean;
    tooltip?: string;
  };

export type MiniButtonProps = CommonButtonProps & {
  size: "mini";
  icon: React.ComponentType;
  label?: never;
};

export type RegularButtonProps = CommonButtonProps & {
  size?: Exclude<ButtonSizeType, "mini">;
  icon?: React.ComponentType;
  label?: string;
};

export type ButtonProps = MiniButtonProps | RegularButtonProps;

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      label,
      icon,
      className,
      isLoading = false,
      variant = "primary",
      tooltip,
      isSelect = false,
      isPulsing = false,
      size = "sm",
      href,
      target,
      rel,
      replace,
      shallow,
      "aria-label": ariaLabel,
      ...props
    },
    ref
  ) => {
    const iconsSize = size === "mini" ? "sm" : size;

    const spinnerVariant = isLoading
      ? (variant && spinnerVariantsMapIsLoading[variant]) || "slate400"
      : (variant && spinnerVariantsMap[variant]) || "slate400";

    const renderIcon = (visual: React.ComponentType, extraClass = "") => (
      <Icon visual={visual} size={iconsSize} className={extraClass} />
    );

    const content = (
      <>
        {isLoading ? (
          <div className="-s-mx-0.5">
            <Spinner size={iconsSize} variant={spinnerVariant} />
          </div>
        ) : (
          icon && renderIcon(icon, "-s-mx-0.5")
        )}
        {label}
        {isSelect && renderIcon(ChevronDownIcon, isLoading ? "" : "-s-mr-1")}
      </>
    );

    const innerButton = (
      <MetaButton
        ref={ref}
        size={size}
        disabled={isLoading || props.disabled}
        className={cn(
          buttonVariants({ variant, size }),
          isPulsing && "s-animate-pulse",
          className
        )}
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

    const wrappedContent = tooltip ? (
      <TooltipProvider>
        <TooltipRoot>
          <TooltipTrigger asChild>{innerButton}</TooltipTrigger>
          <TooltipPortal>
            <TooltipContent>{tooltip}</TooltipContent>
          </TooltipPortal>
        </TooltipRoot>
      </TooltipProvider>
    ) : (
      innerButton
    );

    return href ? (
      <LinkWrapper
        href={href}
        target={target}
        rel={rel}
        replace={replace}
        shallow={shallow}
      >
        {wrappedContent}
      </LinkWrapper>
    ) : (
      wrappedContent
    );
  }
);

Button.displayName = "Button";

export { Button, buttonVariants, MetaButton };
