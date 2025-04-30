import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

import {
  Counter,
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
import { ChevronDownIcon } from "@sparkle/icons/app";
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

export const BUTTON_SIZES = ["xmini", "mini", "xs", "sm", "md"] as const;
export type ButtonSizeType = (typeof BUTTON_SIZES)[number];

// Define button styling with cva
const buttonVariants = cva(
  cn(
    "s-inline-flex s-items-center s-justify-center s-whitespace-nowrap s-ring-offset-background s-transition-colors s-ring-inset",
    "focus-visible:s-outline-none focus-visible:s-ring-2 focus-visible:s-ring-ring focus-visible:s-ring-offset-0",
    "dark:focus-visible:s-ring-0 dark:focus-visible:s-ring-offset-1"
  ),
  {
    variants: {
      variant: {
        primary: cn(
          "s-bg-primary-800 dark:s-bg-primary-800-night",
          "s-text-primary-50 dark:s-text-primary-50-night",
          "hover:s-bg-primary-light dark:hover:s-bg-primary-dark-night",
          "active:s-bg-primary-dark dark:active:s-bg-primary-light-night",
          "disabled:s-bg-primary-muted disabled:s-text-highlight-50/60 dark:disabled:s-bg-primary-muted-night"
        ),
        highlight: cn(
          "s-bg-highlight",
          "s-text-highlight-50",
          "hover:s-bg-highlight-light",
          "active:s-bg-highlight-dark",
          "disabled:s-bg-highlight-muted disabled:s-text-highlight-50/60 dark:disabled:s-bg-highlight-muted-night"
        ),
        warning: cn(
          "s-bg-warning",
          "s-text-warning-50",
          "hover:s-bg-warning-light",
          "active:s-bg-warning-dark",
          "disabled:s-bg-warning-muted disabled:s-text-highlight-50/60 dark:disabled:s-bg-warning-muted-night"
        ),
        outline: cn(
          "s-border",
          "s-border-border dark:s-border-border-night",
          "s-text-primary dark:s-text-primary-night",
          "s-bg-background dark:s-bg-background-night",
          "hover:s-text-primary dark:hover:s-text-primary-night",
          "hover:s-bg-primary-100 dark:hover:s-bg-primary-900",
          "hover:s-border-primary-150 dark:hover:s-border-border-night",
          "active:s-bg-primary-300 dark:active:s-bg-primary-900",
          "disabled:s-text-primary-muted dark:disabled:s-text-primary-muted-night",
          "disabled:s-border-primary-100 dark:disabled:s-border-primary-100-night"
        ),
        ghost: cn(
          "s-border",
          "s-border-border/0 dark:s-border-border-night/0",
          "s-text-foreground dark:s-text-white",
          "hover:s-bg-primary-100 dark:hover:s-bg-primary-900",
          "hover:s-text-primary-900 dark:hover:s-text-white",
          "hover:s-border-border-dark dark:hover:s-border-border-night",
          "active:s-bg-primary-300 dark:active:s-bg-primary-900",
          "disabled:s-text-primary-400 dark:disabled:s-text-primary-400-night"
        ),
        "ghost-secondary": cn(
          "s-border",
          "s-border-border/0 dark:s-border-border-night/0",
          "s-text-muted-foreground dark:s-text-muted-foreground-night",
          "hover:s-bg-primary-100 dark:hover:s-bg-primary-900",
          "hover:s-text-primary-900 dark:hover:s-text-primary-900-night",
          "hover:s-border-border-dark dark:hover:s-border-border-night",
          "active:s-bg-primary-300 dark:active:s-bg-primary-900",
          "disabled:s-text-primary-400 dark:disabled:s-text-primary-400-night"
        ),
      },
      size: {
        xmini: "s-h-6 s-w-6 s-rounded-lg s-label-xs s-gap-1 s-shrink-0",
        mini: "s-h-7 s-w-7 s-rounded-lg s-label-xs s-gap-1.5 s-shrink-0",
        xs: "s-h-7 s-px-2.5 s-rounded-lg s-label-xs s-gap-1.5 s-shrink-0",
        sm: "s-h-9 s-px-3 s-rounded-xl s-label-sm s-gap-2 s-shrink-0",
        md: "s-h-12 s-px-4 s-py-2 s-rounded-2xl s-label-base s-gap-2.5 s-shrink-0",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "sm",
    },
  }
);

const labelVariants = cva("", {
  variants: {
    size: {
      xmini: "s-label-xs s-hidden",
      mini: "s-label-xs s-hidden",
      xs: "s-label-xs",
      sm: "s-label-sm",
      md: "s-label-base",
    },
  },
  defaultVariants: {
    size: "sm",
  },
});

type SpinnerVariant = NonNullable<SpinnerProps["variant"]>;

const spinnerVariantsMap: Record<ButtonVariantType, SpinnerVariant> = {
  primary: "gray50",
  highlight: "gray50",
  warning: "gray50",
  outline: "gray500",
  ghost: "gray500",
  "ghost-secondary": "gray400",
};

const chevronVariantMap = {
  primary: "s-text-white/70",
  outline: "s-text-foreground/70 dark:s-text-foreground-night/70",
  ghost: "s-text-foreground/70 dark:s-text-foreground-night/70",
  "ghost-secondary": "s-text-foreground/70 dark:s-text-foreground-night/70",
  highlight: "s-text-white/70",
  warning: "s-text-white/70",
} as const;

export interface MetaButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const MetaButton = React.forwardRef<HTMLButtonElement, MetaButtonProps>(
  ({ className, asChild = false, variant, size, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      >
        {children}
      </Comp>
    );
  }
);
MetaButton.displayName = "MetaButton";

type IconSizeType = "xs" | "sm" | "md";
type CounterSizeType = "xs" | "sm" | "md";

const ICON_SIZE_MAP: Record<ButtonSizeType, IconSizeType> = {
  xmini: "xs",
  mini: "sm",
  xs: "xs",
  sm: "sm",
  md: "md",
};

const COUNTER_SIZE_MAP: Record<ButtonSizeType, CounterSizeType> = {
  xmini: "xs",
  mini: "xs",
  xs: "xs",
  sm: "sm",
  md: "md",
};

type CommonButtonProps = Omit<MetaButtonProps, "children"> &
  Omit<LinkWrapperProps, "children"> & {
    isSelect?: boolean;
    isLoading?: boolean;
    isPulsing?: boolean;
    tooltip?: string;
    isCounter?: boolean;
    counterValue?: string;
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
      isCounter = false,
      counterValue,
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
    const iconSize = ICON_SIZE_MAP[size];
    const counterSize = COUNTER_SIZE_MAP[size];

    const renderIcon = (visual: React.ComponentType, extraClass = "") => (
      <Icon visual={visual} size={iconSize} className={cn(extraClass)} />
    );
    const renderChevron = (visual: React.ComponentType, extraClass = "") => (
      <Icon
        visual={visual}
        size={iconSize}
        className={cn(variant ? chevronVariantMap[variant] : "", extraClass)}
      />
    );

    const showCounter = isCounter && counterValue != null;
    const showContainer = label || showCounter;

    const content = (
      <>
        {isLoading ? (
          <div
            className={cn(
              "-s-mx-0.5",
              size === "mini" && "s-w-5 s-px-0.5",
              size === "xmini" && "s-w-5 s-px-0.5"
            )}
          >
            <Spinner
              size={size === "mini" || size === "xmini" ? "xs" : iconSize}
              variant={(variant && spinnerVariantsMap[variant]) || "gray400"}
            />
          </div>
        ) : (
          icon && renderIcon(icon, "-s-mx-0.5")
        )}

        {showContainer && (
          <div
            className={cn(
              "s-flex s-items-center s-gap-2",
              labelVariants({ size })
            )}
          >
            {label}
            {showCounter && (
              <Counter
                value={Number(counterValue)}
                variant={variant || "primary"}
                size={counterSize}
                isInButton={true}
              />
            )}
          </div>
        )}
        {isSelect && renderChevron(ChevronDownIcon, isLoading ? "" : "-s-mr-1")}
      </>
    );

    const innerButton = (
      <MetaButton
        ref={ref}
        size={size}
        variant={variant}
        disabled={isLoading || props.disabled}
        className={cn(isPulsing && "s-animate-pulse", className)}
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
