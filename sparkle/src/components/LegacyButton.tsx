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
    "inline-flex items-center justify-center whitespace-nowrap ring-offset-background transition-colors ring-inset select-none",
    "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0"
  ),
  {
    variants: {
      variant: {
        primary: cn(
          "border border-transparent",
          "bg-primary-800",
          "text-primary-50",
          "hover:bg-primary-light",
          "active:bg-primary-dark",
          "disabled:bg-primary-muted disabled:text-highlight-on/60"
        ),
        highlight: cn(
          "border border-transparent",
          "bg-highlight",
          "text-highlight-on",
          "hover:bg-highlight-light",
          "active:bg-highlight-dark",
          "disabled:bg-highlight-muted disabled:text-highlight-on/60"
        ),
        "highlight-secondary": cn(
          "border",
          "border-border",
          "text-highlight-500",
          "bg-background",
          "hover:text-highlight-500",
          "hover:bg-highlight-50",
          "hover:border-primary-150",
          "active:bg-primary-300",
          "disabled:text-primary-muted",
          "disabled:border-primary-100",
          "disabled:hover:bg-background",
          "disabled:hover:border-primary-100",
          "disabled:hover:text-primary-muted"
        ),
        warning: cn(
          "border border-transparent",
          "bg-warning",
          "text-warning-on",
          "hover:bg-warning-light",
          "active:bg-warning-dark",
          "disabled:bg-warning-muted disabled:text-highlight-on/60"
        ),
        "warning-secondary": cn(
          "border",
          "border-border",
          "text-warning-500",
          "bg-background",
          "hover:text-warning-500",
          "hover:bg-warning-50",
          "hover:border-primary-150",
          "active:bg-primary-300",
          "disabled:text-primary-muted",
          "disabled:border-primary-100",
          "disabled:hover:bg-background",
          "disabled:hover:border-primary-100",
          "disabled:hover:text-primary-muted"
        ),
        outline: cn(
          "border",
          "border-border",
          "text-primary",
          "bg-background",
          "hover:text-primary",
          "hover:bg-primary-100",
          "hover:border-primary-150",
          "active:bg-primary-300",
          "disabled:text-primary-muted",
          "disabled:border-primary-100",
          "disabled:hover:bg-background",
          "disabled:hover:border-primary-100",
          "disabled:hover:text-primary-muted"
        ),
        ghost: cn(
          "border",
          "border-transparent",
          "text-foreground",
          "hover:bg-hover",
          "hover:text-primary-900",
          "hover:border-transparent",
          "active:bg-primary-300",
          "disabled:text-faint",
          "disabled:hover:bg-transparent",
          "disabled:hover:border-transparent",
          "disabled:hover:text-faint"
        ),
        "ghost-secondary": cn(
          "border",
          "border-transparent",
          "text-muted-foreground",
          "hover:bg-hover",
          "hover:text-primary-900",
          "hover:border-transparent",
          "active:bg-primary-300",
          "disabled:text-faint",
          "disabled:hover:bg-transparent",
          "disabled:hover:border-transparent",
          "disabled:hover:text-faint"
        ),
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

const labelVariants = cva("", {
  variants: {
    size: {
      "icon-xs": "hidden",
      icon: "hidden",
      "icon-sm": "hidden",
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
    { size: "xmini", hasLighterFont: false, className: "label-xs" },
    { size: "mini", hasLighterFont: false, className: "label-xs" },
    { size: "xs", hasLighterFont: false, className: "label-xs" },
    { size: "sm", hasLighterFont: false, className: "label-sm" },
    { size: "md", hasLighterFont: false, className: "label-base" },
    {
      size: "xmini",
      hasLighterFont: true,
      className: "text-xs font-normal",
    },
    {
      size: "mini",
      hasLighterFont: true,
      className: "text-xs font-normal",
    },
    { size: "xs", hasLighterFont: true, className: "text-xs font-normal" },
    { size: "sm", hasLighterFont: true, className: "text-sm font-normal" },
    {
      size: "md",
      hasLighterFont: true,
      className: "text-base font-normal",
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
  primary: "text-faint",
  outline: "text-faint",
  ghost: "text-faint",
  "ghost-secondary": "text-faint",
  highlight: "text-white/60",
  "highlight-secondary": "text-highlight-500",
  warning: "text-white/60",
  "warning-secondary": "text-warning-500",
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

const loadingContainerVariants = cva("-mx-0.5", {
  variants: {
    size: {
      "icon-xs": "w-5 px-0.5",
      icon: "w-5 px-0.5",
      "icon-sm": "",
      xmini: "w-5 px-0.5",
      mini: "w-5 px-0.5",
      xs: "w-5 px-0.5",
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
      "icon-xs": "w-auto px-1.5",
      xmini: "w-auto px-1.5",
      mini: "w-auto px-2",
      icon: "w-auto px-2",
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
    /** Appends a dropdown chevron, signalling the button opens a menu. */
    isSelect?: boolean;
    /** Replaces the icon with a spinner and disables interaction during async work. */
    isLoading?: boolean;
    /** Continuously pulses the button ring to draw attention. */
    isPulsing?: boolean;
    /** Pulses the button ring briefly (a few seconds) when set to true. */
    briefPulse?: boolean;
    /** Tooltip shown on hover; also used as the accessible label when none is set. */
    tooltip?: string;
    /** Keyboard shortcut displayed inside the tooltip. */
    tooltipShortcut?: string;
    /** Shows an inline Counter badge with `counterValue`. */
    isCounter?: boolean;
    /** Value displayed in the counter badge when `isCounter` is true. */
    counterValue?: string;
    /** Renders the button fully rounded (pill shape). */
    isRounded?: boolean;
    /** Uses a lighter (normal-weight) font for the label. */
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

/**
 * Legacy button for triggering actions, with several visual variants and sizes,
 * icons, loading and pulsing states, an inline counter, and a dropdown-chevron
 * affordance (`isSelect`). Kept only as a visual reference for legacy product
 * surfaces.
 *
 * @deprecated Use Button instead.
 * @summary Deprecated legacy action button.
 */
const LegacyButton = React.forwardRef<HTMLButtonElement, ButtonProps>(
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
        return <span className={cn(extraClass, "shrink-0")}>{visual}</span>;
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
          icon && renderIcon(icon, "-mx-0.5")
        )}

        {showContainer && (
          <div
            className={cn(
              "flex items-center gap-2",
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
        {isSelect && renderChevron(ChevronDown, isLoading ? "" : "-mr-1")}
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
          (isPulsing || isPulsingBriefly) && "animate-ring-pulse",
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

LegacyButton.displayName = "LegacyButton";

export type LegacyButtonProps = ButtonProps;
export type LegacyButtonVariantType = ButtonVariantType;
export type LegacyRegularButtonSize = RegularButtonSize;
export type LegacyRegularButtonProps = RegularButtonProps;
export type LegacyIconOnlyButtonProps = IconOnlyButtonProps;
export {
  buttonVariants,
  ICON_SIZE_MAP as LEGACY_ICON_SIZE_MAP,
  LegacyButton,
  LegacyButton as Button,
  MetaButton,
};
