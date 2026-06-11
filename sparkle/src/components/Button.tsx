import { Slot } from "@radix-ui/react-slot";
import { Counter } from "@sparkle/components/Counter";
import { Icon } from "@sparkle/components/Icon";
import {
  LinkWrapper,
  type LinkWrapperProps,
} from "@sparkle/components/LinkWrapper";
import type { SpinnerProps } from "@sparkle/components/Spinner";
import { Spinner } from "@sparkle/components/Spinner";
import { Tooltip } from "@sparkle/components/Tooltip";
import { ChevronDown } from "@sparkle/icons/v2-stroke";
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
export const ICON_ONLY_SIZES = ["icon-xs", "icon", "icon-sm"] as const;
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
    "s:inline-flex s:items-center s:justify-center s:whitespace-nowrap s:ring-offset-background s:transition-colors s:ring-inset s:select-none",
    "s:focus-visible:outline-hidden s:focus-visible:ring-2 s:focus-visible:ring-ring s:focus-visible:ring-offset-0",
    "s:dark:focus-visible:ring-0 s:dark:focus-visible:ring-offset-1"
  ),
  {
    variants: {
      variant: {
        primary: cn(
          "s:border s:border-transparent",
          "s:bg-primary-800 s:dark:bg-primary-800-night",
          "s:text-primary-50 s:dark:text-primary-50-night",
          "s:hover:bg-primary-light s:dark:hover:bg-primary-dark-night",
          "s:active:bg-primary-dark s:dark:active:bg-primary-light-night",
          "s:disabled:bg-primary-muted s:disabled:text-highlight-50/60 s:dark:disabled:bg-primary-muted-night"
        ),
        highlight: cn(
          "s:border s:border-transparent",
          "s:bg-highlight",
          "s:text-highlight-50",
          "s:hover:bg-highlight-light",
          "s:active:bg-highlight-dark",
          "s:disabled:bg-highlight-muted s:disabled:text-highlight-50/60 s:dark:disabled:bg-highlight-muted-night"
        ),
        "highlight-secondary": cn(
          "s:border",
          "s:border-border s:dark:border-border-night",
          "s:text-highlight-500 s:dark:text-highlight-500-night",
          "s:bg-background s:dark:bg-background-night",
          "s:hover:text-highlight-500 s:dark:hover:text-highlight-500-night",
          "s:hover:bg-highlight-50 s:dark:hover:bg-highlight-900",
          "s:hover:border-primary-150 s:dark:hover:border-border-night",
          "s:active:bg-primary-300 s:dark:active:bg-primary-900",
          "s:disabled:text-primary-muted s:dark:disabled:text-primary-muted-night",
          "s:disabled:border-primary-100 s:dark:disabled:border-primary-100-night",
          "s:disabled:hover:bg-background s:dark:disabled:hover:bg-background-night",
          "s:disabled:hover:border-primary-100 s:dark:disabled:hover:border-primary-100-night",
          "s:disabled:hover:text-primary-muted s:dark:disabled:hover:text-primary-muted-night"
        ),
        warning: cn(
          "s:border s:border-transparent",
          "s:bg-warning",
          "s:text-warning-50",
          "s:hover:bg-warning-light",
          "s:active:bg-warning-dark",
          "s:disabled:bg-warning-muted s:disabled:text-highlight-50/60 s:dark:disabled:bg-warning-muted-night"
        ),
        "warning-secondary": cn(
          "s:border",
          "s:border-border s:dark:border-border-night",
          "s:text-warning-500 s:dark:text-warning-500-night",
          "s:bg-background s:dark:bg-background-night",
          "s:hover:text-warning-500 s:dark:hover:text-warning-500-night",
          "s:hover:bg-warning-50 s:dark:hover:bg-warning-900",
          "s:hover:border-primary-150 s:dark:hover:border-border-night",
          "s:active:bg-primary-300 s:dark:active:bg-primary-900",
          "s:disabled:text-primary-muted s:dark:disabled:text-primary-muted-night",
          "s:disabled:border-primary-100 s:dark:disabled:border-primary-100-night",
          "s:disabled:hover:bg-background s:dark:disabled:hover:bg-background-night",
          "s:disabled:hover:border-primary-100 s:dark:disabled:hover:border-primary-100-night",
          "s:disabled:hover:text-primary-muted s:dark:disabled:hover:text-primary-muted-night"
        ),
        outline: cn(
          "s:border",
          "s:border-border s:dark:border-border-night",
          "s:text-primary s:dark:text-primary-night",
          "s:bg-background s:dark:bg-background-night",
          "s:hover:text-primary s:dark:hover:text-primary-night",
          "s:hover:bg-primary-100 s:dark:hover:bg-primary-900",
          "s:hover:border-primary-150 s:dark:hover:border-border-night",
          "s:active:bg-primary-300 s:dark:active:bg-primary-900",
          "s:disabled:text-primary-muted s:dark:disabled:text-primary-muted-night",
          "s:disabled:border-primary-100 s:dark:disabled:border-primary-100-night",
          "s:disabled:hover:bg-background s:dark:disabled:hover:bg-background-night",
          "s:disabled:hover:border-primary-100 s:dark:disabled:hover:border-primary-100-night",
          "s:disabled:hover:text-primary-muted s:dark:disabled:hover:text-primary-muted-night"
        ),
        ghost: cn(
          "s:border",
          "s:border-border/0 s:dark:border-border-night/0",
          "s:text-foreground s:dark:text-white",
          "s:hover:bg-hover s:dark:hover:bg-hover-night",
          "s:hover:text-primary-900 s:dark:hover:text-white",
          "s:hover:border-border/0 s:dark:hover:border-border-night/0",
          "s:active:bg-primary-300 s:dark:active:bg-hover-night",
          "s:disabled:text-primary-400 s:dark:disabled:text-primary-400-night",
          "s:disabled:hover:bg-transparent s:dark:disabled:hover:bg-transparent",
          "s:disabled:hover:border-border/0 s:dark:disabled:hover:border-border-night/0",
          "s:disabled:hover:text-primary-400 s:dark:disabled:hover:text-primary-400-night"
        ),
        "ghost-secondary": cn(
          "s:border",
          "s:border-border/0 s:dark:border-border-night/0",
          "s:text-muted-foreground s:dark:text-muted-foreground-night",
          "s:hover:bg-hover s:dark:hover:bg-hover-night",
          "s:hover:text-primary-900 s:dark:hover:text-primary-900-night",
          "s:hover:border-border/0 s:dark:hover:border-border-night/0",
          "s:active:bg-primary-300 s:dark:active:bg-hover-night",
          "s:disabled:text-primary-400 s:dark:disabled:text-primary-400-night",
          "s:disabled:hover:bg-transparent s:dark:disabled:hover:bg-transparent",
          "s:disabled:hover:border-border/0 s:dark:disabled:hover:border-border-night/0",
          "s:disabled:hover:text-primary-400 s:dark:disabled:hover:text-primary-400-night"
        ),
      },
      size: {
        "icon-xs": "s:h-6 s:w-6 s:gap-1 s:shrink-0",
        icon: "s:h-7 s:w-7 s:gap-1.5 s:shrink-0",
        "icon-sm": "s:h-9 s:w-9 s:gap-2 s:shrink-0",
        xmini: "s:h-6 s:px-1.5 s:gap-1 s:shrink-0",
        mini: "s:h-7 s:px-2 s:gap-1.5 s:shrink-0",
        xs: "s:h-7 s:px-2.5 s:gap-1.5 s:shrink-0",
        sm: "s:h-9 s:px-3 s:gap-2 s:shrink-0",
        md: "s:h-12 s:px-4 s:py-2 s:gap-2.5 s:shrink-0",
      },
      rounded: {
        "icon-xs": "s:rounded-lg",
        icon: "s:rounded-lg",
        "icon-sm": "s:rounded-xl",
        xmini: "s:rounded-lg",
        mini: "s:rounded-lg",
        xs: "s:rounded-lg",
        sm: "s:rounded-xl",
        md: "s:rounded-2xl",
        full: "s:rounded-full",
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
      "icon-xs": "s:hidden",
      icon: "s:hidden",
      "icon-sm": "s:hidden",
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
    { size: "xmini", hasLighterFont: false, className: "s:label-xs" },
    { size: "mini", hasLighterFont: false, className: "s:label-xs" },
    { size: "xs", hasLighterFont: false, className: "s:label-xs" },
    { size: "sm", hasLighterFont: false, className: "s:label-sm" },
    { size: "md", hasLighterFont: false, className: "s:label-base" },
    {
      size: "xmini",
      hasLighterFont: true,
      className: "s:text-xs s:font-normal",
    },
    {
      size: "mini",
      hasLighterFont: true,
      className: "s:text-xs s:font-normal",
    },
    { size: "xs", hasLighterFont: true, className: "s:text-xs s:font-normal" },
    { size: "sm", hasLighterFont: true, className: "s:text-sm s:font-normal" },
    {
      size: "md",
      hasLighterFont: true,
      className: "s:text-base s:font-normal",
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
  primary: "s:text-muted-foreground-night s:dark:text-muted-foreground",
  outline: "s:text-faint",
  ghost: "s:text-faint",
  "ghost-secondary": "s:text-faint",
  highlight: "s:text-white/60",
  "highlight-secondary": "s:text-highlight-500 s:dark:text-highlight-500-night",
  warning: "s:text-white/60",
  "warning-secondary": "s:text-warning-500 s:dark:text-warning-500-night",
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
  "icon-sm": "sm",
  xmini: "xs",
  mini: "sm",
  xs: "xs",
  sm: "sm",
  md: "md",
};

const COUNTER_SIZE_MAP: Record<ButtonSize, CounterSizeType> = {
  "icon-xs": "xs",
  icon: "xs",
  "icon-sm": "sm",
  xmini: "xs",
  mini: "xs",
  xs: "xs",
  sm: "sm",
  md: "md",
};

const loadingContainerVariants = cva("s:-mx-0.5", {
  variants: {
    size: {
      "icon-xs": "s:w-5 s:px-0.5",
      icon: "s:w-5 s:px-0.5",
      "icon-sm": "",
      xmini: "s:w-5 s:px-0.5",
      mini: "s:w-5 s:px-0.5",
      xs: "s:w-5 s:px-0.5",
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
      "icon-xs": "s:w-auto s:px-1.5",
      xmini: "s:w-auto s:px-1.5",
      mini: "s:w-auto s:px-2",
      icon: "s:w-auto s:px-2",
      "icon-sm": "",
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

export type ButtonIconType = React.ComponentType | React.ReactElement;

function isReactElement(visual: ButtonIconType): visual is React.ReactElement {
  return React.isValidElement(visual);
}

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

    const renderIcon = (visual: ButtonIconType, extraClass = "") => {
      if (isReactElement(visual)) {
        return <span className={cn(extraClass, "s:shrink-0")}>{visual}</span>;
      }

      return (
        <Icon visual={visual} size={iconSize} className={cn(extraClass)} />
      );
    };
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
          icon && renderIcon(icon, "s:-mx-0.5")
        )}

        {showContainer && (
          <div
            className={cn(
              "s:flex s:items-center s:gap-2",
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
        {isSelect && renderChevron(ChevronDown, isLoading ? "" : "s:-mr-1")}
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
          (isPulsing || isPulsingBriefly) && "s:animate-ring-pulse",
          isSelect && selectButtonSizeVariants({ size }),
          className
        )}
        aria-label={ariaLabel || tooltip || label}
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
