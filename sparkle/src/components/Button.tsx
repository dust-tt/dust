/** biome-ignore-all lint/suspicious/noImportCycles: I'm too lazy to fix that now */

import { Slot } from "@radix-ui/react-slot";
import {
  Counter,
  Icon,
  LinkWrapper,
  type LinkWrapperProps,
  Spinner,
  Tooltip,
} from "@sparkle/components/";
import type { SpinnerProps } from "@sparkle/components/Spinner";
import { ChevronDownIcon } from "@sparkle/icons/app";
import { cn } from "@sparkle/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { useEffect, useMemo, useState } from "react";

const PULSE_ANIMATION_DURATION = 1;

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
export const ICON_ONLY_SIZES = ["icon-xs", "icon"] as const;
export const SMALL_BUTTON_SIZES = ["icon-xs", "icon", "xmini", "mini"] as const;

export type RegularButtonSize = (typeof REGULAR_BUTTON_SIZES)[number];
export type IconOnlySize = (typeof ICON_ONLY_SIZES)[number];
export type ButtonSize = RegularButtonSize | IconOnlySize;

function isSmallButtonSize(
  size: ButtonSize | undefined
): size is (typeof SMALL_BUTTON_SIZES)[number] {
  return (
    size !== undefined &&
    SMALL_BUTTON_SIZES.includes(size as (typeof SMALL_BUTTON_SIZES)[number])
  );
}

// Define button styling with cva
const buttonVariants = cva(
  cn(
    "s-inline-flex s-items-center s-justify-center s-whitespace-nowrap s-ring-offset-background s-transition-colors s-ring-inset s-select-none",
    "focus-visible:s-outline-none focus-visible:s-ring-2 focus-visible:s-ring-ring focus-visible:s-ring-offset-0",
    "dark:focus-visible:s-ring-0 dark:focus-visible:s-ring-offset-1"
  ),
  {
    variants: {
      variant: {
        primary: cn(
          "s-border s-border-transparent",
          "s-bg-primary-800 dark:s-bg-primary-800-night",
          "s-text-primary-50 dark:s-text-primary-50-night",
          "hover:s-bg-primary-light dark:hover:s-bg-primary-dark-night",
          "active:s-bg-primary-dark dark:active:s-bg-primary-light-night",
          "disabled:s-bg-primary-muted disabled:s-text-highlight-50/60 dark:disabled:s-bg-primary-muted-night"
        ),
        highlight: cn(
          "s-border s-border-transparent",
          "s-bg-highlight",
          "s-text-highlight-50",
          "hover:s-bg-highlight-light",
          "active:s-bg-highlight-dark",
          "disabled:s-bg-highlight-muted disabled:s-text-highlight-50/60 dark:disabled:s-bg-highlight-muted-night"
        ),
        "highlight-secondary": cn(
          "s-border",
          "s-border-border dark:s-border-border-night",
          "s-text-highlight-500 dark:s-text-highlight-500-night",
          "s-bg-background dark:s-bg-background-night",
          "hover:s-text-highlight-500 dark:hover:s-text-highlight-500-night",
          "hover:s-bg-highlight-50 dark:hover:s-bg-highlight-900",
          "hover:s-border-primary-150 dark:hover:s-border-border-night",
          "active:s-bg-primary-300 dark:active:s-bg-primary-900",
          "disabled:s-text-primary-muted dark:disabled:s-text-primary-muted-night",
          "disabled:s-border-primary-100 dark:disabled:s-border-primary-100-night",
          "disabled:hover:s-bg-background dark:disabled:hover:s-bg-background-night",
          "disabled:hover:s-border-primary-100 dark:disabled:hover:s-border-primary-100-night",
          "disabled:hover:s-text-primary-muted dark:disabled:hover:s-text-primary-muted-night"
        ),
        warning: cn(
          "s-border s-border-transparent",
          "s-bg-warning",
          "s-text-warning-50",
          "hover:s-bg-warning-light",
          "active:s-bg-warning-dark",
          "disabled:s-bg-warning-muted disabled:s-text-highlight-50/60 dark:disabled:s-bg-warning-muted-night"
        ),
        "warning-secondary": cn(
          "s-border",
          "s-border-border dark:s-border-border-night",
          "s-text-warning-500 dark:s-text-warning-500-night",
          "s-bg-background dark:s-bg-background-night",
          "hover:s-text-warning-500 dark:hover:s-text-warning-500-night",
          "hover:s-bg-warning-50 dark:hover:s-bg-warning-900",
          "hover:s-border-primary-150 dark:hover:s-border-border-night",
          "active:s-bg-primary-300 dark:active:s-bg-primary-900",
          "disabled:s-text-primary-muted dark:disabled:s-text-primary-muted-night",
          "disabled:s-border-primary-100 dark:disabled:s-border-primary-100-night",
          "disabled:hover:s-bg-background dark:disabled:hover:s-bg-background-night",
          "disabled:hover:s-border-primary-100 dark:disabled:hover:s-border-primary-100-night",
          "disabled:hover:s-text-primary-muted dark:disabled:hover:s-text-primary-muted-night"
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
          "disabled:s-border-primary-100 dark:disabled:s-border-primary-100-night",
          "disabled:hover:s-bg-background dark:disabled:hover:s-bg-background-night",
          "disabled:hover:s-border-primary-100 dark:disabled:hover:s-border-primary-100-night",
          "disabled:hover:s-text-primary-muted dark:disabled:hover:s-text-primary-muted-night"
        ),
        ghost: cn(
          "s-border",
          "s-border-border/0 dark:s-border-border-night/0",
          "s-text-foreground dark:s-text-white",
          "hover:s-bg-primary-100 dark:hover:s-bg-primary-900",
          "hover:s-text-primary-900 dark:hover:s-text-white",
          "hover:s-border-border-dark dark:hover:s-border-border-night",
          "active:s-bg-primary-300 dark:active:s-bg-primary-900",
          "disabled:s-text-primary-400 dark:disabled:s-text-primary-400-night",
          "disabled:hover:s-bg-transparent dark:disabled:hover:s-bg-transparent",
          "disabled:hover:s-border-border/0 dark:disabled:hover:s-border-border-night/0",
          "disabled:hover:s-text-primary-400 dark:disabled:hover:s-text-primary-400-night"
        ),
        "ghost-secondary": cn(
          "s-border",
          "s-border-border/0 dark:s-border-border-night/0",
          "s-text-muted-foreground dark:s-text-muted-foreground-night",
          "hover:s-bg-primary-100 dark:hover:s-bg-primary-900",
          "hover:s-text-primary-900 dark:hover:s-text-primary-900-night",
          "hover:s-border-border-dark dark:hover:s-border-border-night",
          "active:s-bg-primary-300 dark:active:s-bg-primary-900",
          "disabled:s-text-primary-400 dark:disabled:s-text-primary-400-night",
          "disabled:hover:s-bg-transparent dark:disabled:hover:s-bg-transparent",
          "disabled:hover:s-border-border/0 dark:disabled:hover:s-border-border-night/0",
          "disabled:hover:s-text-primary-400 dark:disabled:hover:s-text-primary-400-night"
        ),
      },
      size: {
        "icon-xs": "s-h-6 s-w-6 s-gap-1 s-shrink-0",
        icon: "s-h-7 s-w-7 s-gap-1.5 s-shrink-0",
        xmini: "s-h-6 s-px-1.5 s-gap-1 s-shrink-0",
        mini: "s-h-7 s-px-2 s-gap-1.5 s-shrink-0",
        xs: "s-h-7 s-px-2.5 s-gap-1.5 s-shrink-0",
        sm: "s-h-9 s-px-3 s-gap-2 s-shrink-0",
        md: "s-h-12 s-px-4 s-py-2 s-gap-2.5 s-shrink-0",
      },
      rounded: {
        "icon-xs": "s-rounded-lg",
        icon: "s-rounded-lg",
        xmini: "s-rounded-lg",
        mini: "s-rounded-lg",
        xs: "s-rounded-lg",
        sm: "s-rounded-xl",
        md: "s-rounded-2xl",
        full: "s-rounded-full",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "sm",
      rounded: "sm",
    },
  }
);

const labelVariants = cva("", {
  variants: {
    size: {
      "icon-xs": "s-hidden",
      icon: "s-hidden",
      xmini: "",
      mini: "",
      xs: "",
      sm: "",
      md: "",
    },
    hasLighterFont: {
      true: "",
      false: "",
    },
  },
  compoundVariants: [
    { size: "xmini", hasLighterFont: false, className: "s-label-xs" },
    { size: "mini", hasLighterFont: false, className: "s-label-xs" },
    { size: "xs", hasLighterFont: false, className: "s-label-xs" },
    { size: "sm", hasLighterFont: false, className: "s-label-sm" },
    { size: "md", hasLighterFont: false, className: "s-label-base" },
    {
      size: "xmini",
      hasLighterFont: true,
      className: "s-text-xs s-font-normal",
    },
    {
      size: "mini",
      hasLighterFont: true,
      className: "s-text-xs s-font-normal",
    },
    { size: "xs", hasLighterFont: true, className: "s-text-xs s-font-normal" },
    { size: "sm", hasLighterFont: true, className: "s-text-sm s-font-normal" },
    {
      size: "md",
      hasLighterFont: true,
      className: "s-text-base s-font-normal",
    },
  ],
  defaultVariants: {
    size: "sm",
  },
});

type SpinnerVariant = NonNullable<SpinnerProps["variant"]>;

const spinnerVariantsMap: Record<ButtonVariantType, SpinnerVariant> = {
  primary: "revert",
  highlight: "light",
  "highlight-secondary": "mono",
  warning: "light",
  "warning-secondary": "mono",
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
  "highlight-secondary": "s-text-highlight-500 dark:s-text-highlight-500-night",
  warning: "s-text-white/60",
  "warning-secondary": "s-text-warning-500 dark:s-text-warning-500-night",
} as const;

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

    // Determine rounded variant based on isRounded prop
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

type IconSizeType = "xs" | "sm" | "md";
type CounterSizeType = "xs" | "sm" | "md";

export const ICON_SIZE_MAP: Record<ButtonSize, IconSizeType> = {
  "icon-xs": "xs",
  icon: "sm",
  xmini: "xs",
  mini: "sm",
  xs: "xs",
  sm: "sm",
  md: "md",
};

const COUNTER_SIZE_MAP: Record<ButtonSize, CounterSizeType> = {
  "icon-xs": "xs",
  icon: "xs",
  xmini: "xs",
  mini: "xs",
  xs: "xs",
  sm: "sm",
  md: "md",
};

const loadingContainerVariants = cva("-s-mx-0.5", {
  variants: {
    size: {
      "icon-xs": "s-w-5 s-px-0.5",
      icon: "s-w-5 s-px-0.5",
      xmini: "s-w-5 s-px-0.5",
      mini: "s-w-5 s-px-0.5",
      xs: "s-w-5 s-px-0.5",
      sm: "",
      md: "",
    },
  },
  defaultVariants: {
    size: "sm",
  },
});

const selectButtonSizeVariants = cva("", {
  variants: {
    size: {
      "icon-xs": "s-w-auto s-px-1.5",
      xmini: "s-w-auto s-px-1.5",
      mini: "s-w-auto s-px-2",
      icon: "s-w-auto s-px-2",
      xs: "",
      sm: "",
      md: "",
    },
  },
  defaultVariants: {
    size: "sm",
  },
});

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

export type IconOnlyButtonProps = CommonButtonProps & {
  size: IconOnlySize;
  icon: React.ComponentType;
  label?: never;
};

export type RegularButtonProps = CommonButtonProps & {
  size?: RegularButtonSize;
  icon?: React.ComponentType;
  label?: string;
};

export type ButtonProps = IconOnlyButtonProps | RegularButtonProps;

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      label,
      icon,
      className,
      isLoading = false,
      variant = "primary",
      tooltip,
      tooltipShortcut,
      isSelect = false,
      isPulsing = false,
      briefPulse = false,
      isCounter = false,
      counterValue,
      size = "sm",
      isRounded = false,
      hasLighterFont = false,
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

    const [isPulsingBriefly, setIsPulsingBriefly] = useState(false);

    useEffect(() => {
      if (!briefPulse) {
        return;
      }
      const startPulse = () => {
        setIsPulsingBriefly(true);
        setTimeout(
          () => setIsPulsingBriefly(false),
          PULSE_ANIMATION_DURATION * 3000
        );
      };
      startPulse();
    }, [briefPulse]);

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
          <div className={loadingContainerVariants({ size })}>
            <Spinner
              size={isSmallButtonSize(size) ? "xs" : iconSize}
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
              labelVariants({ size, hasLighterFont })
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

    const pointerEventProps = useMemo(() => {
      if (isLoading || props.disabled) {
        return {
          onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
            e.preventDefault();
            e.stopPropagation();
          },
        };
      }
      return {};
    }, [isLoading, props.disabled]);

    // We cannot skip a button tag when it's disabled. We need
    // to apply disabled class manually (currently it has :disabled pseudo-class, which won't work if it's not a button)
    // and disable pointer events.
    const shouldUseSlot = !!href && !props.disabled;

    const innerContent = shouldUseSlot ? <span>{content}</span> : content;

    const innerButton = (
      <MetaButton
        ref={ref}
        size={size}
        variant={variant}
        isRounded={isRounded}
        disabled={isLoading || props.disabled}
        className={cn(
          (isPulsing || isPulsingBriefly) && "s-animate-pulse",
          isSelect && selectButtonSizeVariants({ size }),
          className
        )}
        aria-label={ariaLabel || tooltip || label}
        style={
          {
            "--pulse-color": "#93C5FD",
            "--duration": `${PULSE_ANIMATION_DURATION}s`,
          } as React.CSSProperties
        }
        asChild={shouldUseSlot}
        {...props}
        {...pointerEventProps}
      >
        {innerContent}
      </MetaButton>
    );

    const wrappedContent = tooltip ? (
      <Tooltip
        trigger={innerButton}
        tooltipTriggerAsChild={true}
        label={tooltip}
        shortcut={tooltipShortcut}
      />
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
