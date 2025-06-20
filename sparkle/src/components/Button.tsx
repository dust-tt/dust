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

const disabledStyles = {
  primary:
    "disabled:s-bg-primary-muted disabled:s-text-highlight-50/60 dark:disabled:s-bg-primary-muted-night",
  highlight:
    "disabled:s-bg-highlight-muted disabled:s-text-highlight-50/60 dark:disabled:s-bg-highlight-muted-night",
  warning:
    "disabled:s-bg-warning-muted disabled:s-text-highlight-50/60 dark:disabled:s-bg-warning-muted-night",
  outline:
    "disabled:s-text-primary-muted dark:disabled:s-text-primary-muted-night disabled:s-border-primary-100 dark:disabled:s-border-primary-100-night",
  ghost: "disabled:s-text-primary-400 dark:disabled:s-text-primary-400-night",
  "ghost-secondary":
    "disabled:s-text-primary-400 dark:disabled:s-text-primary-400-night",
} as const;

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
          disabledStyles.primary
        ),
        highlight: cn(
          "s-bg-highlight",
          "s-text-highlight-50",
          "hover:s-bg-highlight-light",
          "active:s-bg-highlight-dark",
          disabledStyles.highlight
        ),
        warning: cn(
          "s-bg-warning",
          "s-text-warning-50",
          "hover:s-bg-warning-light",
          "active:s-bg-warning-dark",
          disabledStyles.warning
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
          disabledStyles.outline
        ),
        ghost: cn(
          "s-border",
          "s-border-border/0 dark:s-border-border-night/0",
          "s-text-foreground dark:s-text-white",
          "hover:s-bg-primary-100 dark:hover:s-bg-primary-900",
          "hover:s-text-primary-900 dark:hover:s-text-white",
          "hover:s-border-border-dark dark:hover:s-border-border-night",
          "active:s-bg-primary-300 dark:active:s-bg-primary-900",
          disabledStyles.ghost
        ),
        "ghost-secondary": cn(
          "s-border",
          "s-border-border/0 dark:s-border-border-night/0",
          "s-text-muted-foreground dark:s-text-muted-foreground-night",
          "hover:s-bg-primary-100 dark:hover:s-bg-primary-900",
          "hover:s-text-primary-900 dark:hover:s-text-primary-900-night",
          "hover:s-border-border-dark dark:hover:s-border-border-night",
          "active:s-bg-primary-300 dark:active:s-bg-primary-900",
          disabledStyles["ghost-secondary"]
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

const getDisabledClasses = (variant: ButtonVariantType) => {
  const disabledStyle = disabledStyles[variant] || "";
  // Remove the "disabled:" prefix since this will be used for <a> tag and not <button>.
  return disabledStyle
    .replace(/disabled:/g, "")
    .replace(/dark:disabled:/g, "dark:");
};

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
  primary: "revert",
  highlight: "light",
  warning: "light",
  outline: "mono",
  ghost: "mono",
  "ghost-secondary": "mono",
};

const chevronVariantMap = {
  primary: "s-text-muted-foreground-night dark:s-text-muted-foreground",
  outline: "s-text-faint",
  ghost: "s-text-faint",
  "ghost-secondary": "s-text-faint",
  highlight: "s-text-white/60",
  warning: "s-text-white/60",
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

export const ICON_SIZE_MAP: Record<ButtonSizeType, IconSizeType> = {
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

const ContentWithTooltip = ({
  children,
  tooltip,
}: {
  children: React.ReactNode;
  tooltip: string;
}) => {
  return (
    <TooltipProvider>
      <TooltipRoot>
        <TooltipTrigger asChild>
          <span>{children}</span>
        </TooltipTrigger>
        <TooltipPortal>
          <TooltipContent>{tooltip}</TooltipContent>
        </TooltipPortal>
      </TooltipRoot>
    </TooltipProvider>
  );
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
      prefetch,
      "aria-label": ariaLabel,
      ...props
    },
    ref
  ) => {
    // Add explicit fallback for SSR
    const resolvedVariant = variant || "primary";
    const resolvedSize = size || "sm";

    const iconSize = ICON_SIZE_MAP[resolvedSize];
    const counterSize = COUNTER_SIZE_MAP[resolvedSize];

    const renderIcon = (visual: React.ComponentType, extraClass = "") => (
      <Icon visual={visual} size={iconSize} className={cn(extraClass)} />
    );
    const renderChevron = (visual: React.ComponentType, extraClass = "") => (
      <Icon
        visual={visual}
        size={iconSize}
        className={cn(
          resolvedVariant ? chevronVariantMap[resolvedVariant] : "",
          extraClass
        )}
      />
    );

    const showCounter = isCounter && counterValue != null;
    const showContainer = showCounter;

    const content = (
      <>
        {isLoading ? (
          <div
            className={cn(
              "-s-mx-0.5",
              resolvedSize === "mini" && "s-w-5 s-px-0.5",
              resolvedSize === "xmini" && "s-w-5 s-px-0.5"
            )}
          >
            <Spinner
              size={
                resolvedSize === "mini" || resolvedSize === "xmini"
                  ? "xs"
                  : iconSize
              }
              variant={spinnerVariantsMap[resolvedVariant] || "gray400"}
            />
          </div>
        ) : (
          icon && renderIcon(icon, "-s-mx-0.5")
        )}
        {!showContainer && label && <>{label}</>}
        {showContainer && (
          <div
            className={cn(
              "s-flex s-items-center s-gap-2",
              labelVariants({ size: resolvedSize })
            )}
          >
            {label}
            {showCounter && (
              <Counter
                value={Number(counterValue)}
                variant={resolvedVariant}
                size={counterSize}
                isInButton={true}
              />
            )}
          </div>
        )}
        {isSelect && renderChevron(ChevronDownIcon, isLoading ? "" : "-s-mr-1")}
      </>
    );

    // TODO (yuka: 2025-06-20): I don't know what to do when there are both href and onClick.
    if (href && !props.onClick) {
      return (
        <LinkWrapper
          ref={ref as React.Ref<HTMLAnchorElement>}
          href={href}
          target={target}
          rel={rel}
          replace={replace}
          shallow={shallow}
          prefetch={prefetch}
          className={cn(
            // This cannot apply disabled styles for links, since it's using :disabled pseudo-class to apply styles.
            // We will manually add disabled styles for links (getDisabledClasses).
            buttonVariants({
              variant: resolvedVariant,
              size: resolvedSize,
              className,
            }),
            "s-inline-block",
            isPulsing && "s-animate-pulse",
            (isLoading || props.disabled) && [
              getDisabledClasses(resolvedVariant),
              "s-pointer-events-none",
            ]
          )}
          style={
            {
              "--pulse-color": "#93C5FD",
              "--duration": "1.5s",
            } as React.CSSProperties
          }
        >
          {tooltip ? (
            <ContentWithTooltip tooltip={tooltip}>{content}</ContentWithTooltip>
          ) : (
            <>{content}</>
          )}
        </LinkWrapper>
      );
    }

    const innerButton = (
      <MetaButton
        ref={ref}
        size={resolvedSize}
        variant={resolvedVariant}
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

    return tooltip ? (
      <ContentWithTooltip tooltip={tooltip}>{innerButton}</ContentWithTooltip>
    ) : (
      innerButton
    );
  }
);

Button.displayName = "Button";

export { Button, buttonVariants, MetaButton };
