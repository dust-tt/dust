import { Slot } from "@radix-ui/react-slot";
import { Counter } from "@sparkle/components/Counter";
import { Icon } from "@sparkle/components/Icon";
import {
  LinkWrapper,
  type LinkWrapperProps,
} from "@sparkle/components/LinkWrapper";
import { Spinner } from "@sparkle/components/Spinner";
import { Tooltip } from "@sparkle/components/Tooltip";
import { ChevronDown } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";

// Replaces the legacy button (now DeprecatedButton). Sizes use a 24/32/40px
// scale. In dark mode, primary and outline swap (each renders the other's light
// design); other variants are unchanged apart from ghost text/hover tints,
// which flip via -night tokens.

export const BUTTON_VARIANTS = [
  "primary",
  "highlight",
  "outline",
  "warning",
  "ghost",
  "ghost-secondary",
  "highlight-ghost",
  "warning-ghost",
] as const;

export type ButtonVariantType = (typeof BUTTON_VARIANTS)[number];

export const BUTTON_SIZES = ["xs", "sm", "md"] as const;
export type ButtonSizeType = (typeof BUTTON_SIZES)[number];

// Per-variant shadow: tinted 0.5px outline + soft drop + faint inset highlight.
// The outline hex is literal because arbitrary shadows can't use theme tokens.
const SOLID_SHADOW = (outline: string) =>
  `s-shadow-[inset_0_0_1px_0_rgba(255,255,255,0.08),0_0_0.5px_0_${outline},0_1px_1.5px_0_rgba(0,0,0,0.10)]`;
const OUTLINE_SHADOW =
  "s-shadow-[inset_0_0_1px_0_rgba(255,255,255,0.08),0_0_0.5px_0_#DFE0E2,0_0.5px_1px_0_rgba(0,0,0,0.06)]";

// Hover/active overlay for the raised variants. Per-variant (not in the base)
// so ghost variants leave the ::after pseudo free for consumers (e.g. Tabs).
const OVERLAY = cn(
  "after:s-pointer-events-none after:s-absolute after:s-inset-0 after:s-rounded-[inherit]",
  "after:s-transition-colors disabled:after:s-hidden"
);

// `dark:` shadow literals for the primary/outline swap, spelled out (not a
// computed prefix) so Tailwind's JIT emits them.
const DARK_OUTLINE_SHADOW =
  "dark:s-shadow-[inset_0_0_1px_0_rgba(255,255,255,0.08),0_0_0.5px_0_#DFE0E2,0_0.5px_1px_0_rgba(0,0,0,0.06)]";
const DARK_SOLID_SHADOW =
  "dark:s-shadow-[inset_0_0_1px_0_rgba(255,255,255,0.08),0_0_0.5px_0_#44403b,0_1px_1.5px_0_rgba(0,0,0,0.10)]";

const buttonVariants = cva(
  cn(
    "s-relative s-isolate s-inline-flex s-shrink-0 s-select-none s-items-center s-justify-center s-whitespace-nowrap",
    // `transform` stays in the transition list for the `press` scale.
    "s-transition-[color,background-color,border-color,transform] s-duration-150 s-ease-out",
    "motion-reduce:s-transition-none",
    "focus-visible:s-outline-none focus-visible:s-ring-2 focus-visible:s-ring-ring focus-visible:s-ring-offset-0",
    // Disabled styling is per-variant (below), not a blanket opacity.
    "disabled:s-cursor-not-allowed"
  ),
  {
    variants: {
      variant: {
        primary: cn(
          OVERLAY,
          "s-bg-gradient-to-b s-from-stone-700 s-to-stone-800",
          "s-text-white",
          SOLID_SHADOW("#44403b"),
          "hover:after:s-bg-white/10 active:after:s-bg-black/10",
          "disabled:s-from-stone-300 disabled:s-to-stone-400 disabled:s-shadow-none",
          "dark:s-border dark:s-border-border-dark",
          "dark:s-from-white dark:s-to-stone-50 dark:s-text-muted-foreground",
          DARK_OUTLINE_SHADOW,
          "dark:hover:after:s-bg-gray-950/[0.02] dark:active:after:s-bg-gray-950/[0.04]",
          "dark:disabled:s-from-white dark:disabled:s-to-stone-50 dark:disabled:s-shadow-none dark:disabled:s-text-faint"
        ),
        highlight: cn(
          OVERLAY,
          "s-bg-gradient-to-b s-from-highlight-400 s-to-highlight-500",
          "s-text-white",
          SOLID_SHADOW("#4BABFF"),
          "hover:after:s-bg-white/10 active:after:s-bg-black/10",
          "disabled:s-from-highlight-200 disabled:s-to-highlight-300 disabled:s-shadow-none"
        ),
        warning: cn(
          OVERLAY,
          "s-bg-gradient-to-b s-from-red-400 s-to-red-500",
          "s-text-white",
          SOLID_SHADOW("#E76449"),
          "hover:after:s-bg-white/10 active:after:s-bg-black/10",
          "disabled:s-from-red-200 disabled:s-to-red-300 disabled:s-shadow-none"
        ),
        outline: cn(
          OVERLAY,
          "s-border s-border-border-dark",
          "s-bg-gradient-to-b s-from-white s-to-stone-50",
          "s-text-muted-foreground",
          OUTLINE_SHADOW,
          "hover:after:s-bg-gray-950/[0.02] active:after:s-bg-gray-950/[0.04]",
          "disabled:s-shadow-none disabled:s-text-faint",
          "dark:s-border-0 dark:s-from-stone-700 dark:s-to-stone-800 dark:s-text-white",
          DARK_SOLID_SHADOW,
          "dark:hover:after:s-bg-white/10 dark:active:after:s-bg-black/10",
          "dark:disabled:s-from-stone-300 dark:disabled:s-to-stone-400 dark:disabled:s-text-white dark:disabled:s-shadow-none"
        ),
        ghost: cn(
          "s-text-foreground dark:s-text-foreground-night",
          "hover:s-bg-gray-950/[0.02] active:s-bg-gray-950/[0.04]",
          "dark:hover:s-bg-white/[0.04] dark:active:s-bg-white/[0.08]",
          "disabled:s-text-faint dark:disabled:s-text-faint-night",
          "disabled:hover:s-bg-transparent dark:disabled:hover:s-bg-transparent"
        ),
        "ghost-secondary": cn(
          "s-text-muted-foreground dark:s-text-muted-foreground-night",
          "hover:s-bg-gray-950/[0.02] active:s-bg-gray-950/[0.04]",
          "dark:hover:s-bg-white/[0.04] dark:active:s-bg-white/[0.08]",
          "disabled:s-text-faint dark:disabled:s-text-faint-night",
          "disabled:hover:s-bg-transparent dark:disabled:hover:s-bg-transparent"
        ),
        "highlight-ghost": cn(
          "s-text-highlight-500 dark:s-text-highlight-500-night",
          "hover:s-bg-highlight-50 active:s-bg-highlight-100",
          "dark:hover:s-bg-highlight-50-night dark:active:s-bg-highlight-100-night",
          "disabled:s-text-highlight-muted",
          "disabled:hover:s-bg-transparent dark:disabled:hover:s-bg-transparent"
        ),
        "warning-ghost": cn(
          "s-text-red-500",
          "hover:s-bg-red-50 active:s-bg-red-100",
          "dark:hover:s-bg-warning-50-night dark:active:s-bg-warning-100-night",
          "disabled:s-text-red-300",
          "disabled:hover:s-bg-transparent dark:disabled:hover:s-bg-transparent"
        ),
      },
      size: {
        xs: "s-h-6 s-gap-1.5 s-px-2 s-text-sm s-font-medium s-tracking-[-0.28px]",
        sm: "s-h-8 s-gap-1.5 s-px-3 s-text-sm s-font-medium s-tracking-[-0.28px]",
        md: "s-h-10 s-gap-1.5 s-px-4 s-text-base s-font-medium s-tracking-[-0.32px]",
      },
      // Separate from size: twMerge isn't configured for the s- prefix, so a
      // size radius + rounded-full would both emit and let CSS order decide.
      rounded: {
        xs: "s-rounded-[9px]",
        sm: "s-rounded-xl",
        md: "s-rounded-[15px]",
        full: "s-rounded-full",
      },
      isIconOnly: {
        true: "",
        false: "",
      },
      press: {
        true: "active:s-scale-[0.97] motion-reduce:active:s-scale-100",
        false: "",
      },
    },
    compoundVariants: [
      { size: "xs", isIconOnly: true, className: "s-w-6 s-px-0" },
      { size: "sm", isIconOnly: true, className: "s-w-8 s-px-0" },
      { size: "md", isIconOnly: true, className: "s-w-10 s-px-0" },
    ],
    defaultVariants: {
      variant: "primary",
      size: "sm",
      rounded: "md",
      isIconOnly: false,
      press: true,
    },
  }
);

// Labels and icons carry a subtle shadow on raised (non-ghost) variants.
const RAISED_VARIANTS: ButtonVariantType[] = [
  "primary",
  "highlight",
  "warning",
  "outline",
];
const TEXT_SHADOW = "[text-shadow:0_1px_1.5px_rgba(0,0,0,0.08)]";
const ICON_SHADOW = "s-drop-shadow-[0px_1px_0.75px_rgba(0,0,0,0.08)]";

const ICON_SIZE_MAP: Record<ButtonSizeType, "xs" | "sm"> = {
  xs: "xs",
  sm: "xs",
  md: "sm",
};

const COUNTER_SIZE_MAP: Record<ButtonSizeType, "xs" | "sm"> = {
  xs: "xs",
  sm: "xs",
  md: "sm",
};

const chevronVariantMap: Record<ButtonVariantType, string> = {
  primary: "s-text-white/60",
  highlight: "s-text-white/60",
  warning: "s-text-white/60",
  outline: "s-text-faint",
  ghost: "s-text-faint",
  "ghost-secondary": "s-text-faint",
  "highlight-ghost": "s-text-highlight-400",
  "warning-ghost": "s-text-warning-400",
};

export type ButtonIconType = React.ComponentType | React.ReactElement;

function isReactElement(visual: ButtonIconType): visual is React.ReactElement {
  return React.isValidElement(visual);
}

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "size">,
    Omit<LinkWrapperProps, "children" | "className">,
    Pick<VariantProps<typeof buttonVariants>, "variant"> {
  size?: ButtonSizeType;
  label?: string;
  icon?: ButtonIconType;
  iconRight?: ButtonIconType;
  isSelect?: boolean;
  isLoading?: boolean;
  isRounded?: boolean;
  isCounter?: boolean;
  counterValue?: string;
  isPulsing?: boolean;
  tooltip?: string;
  tooltipShortcut?: string;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      label,
      icon,
      iconRight,
      className,
      variant = "primary",
      size = "sm",
      isSelect = false,
      isLoading = false,
      isRounded = false,
      isCounter = false,
      counterValue,
      isPulsing = false,
      tooltip,
      tooltipShortcut,
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
    const showCounter = isCounter && counterValue != null;
    const isIconOnly = !label && !showCounter && !isSelect && !!icon;
    // Menu triggers (dropdown/popover/select) skip the press scale, else the
    // opening menu jumps with the anchor. Radix sets aria-haspopup on the
    // trigger; isSelect is our chevron affordance. Tooltips don't, so they keep it.
    const isMenuTrigger = isSelect || props["aria-haspopup"] != null;
    const hasTextShadow =
      variant != null && RAISED_VARIANTS.includes(variant as ButtonVariantType);
    const iconShadow = hasTextShadow ? ICON_SHADOW : "";

    const renderIcon = (visual: ButtonIconType, extraClass = "") => {
      if (isReactElement(visual)) {
        return <span className={cn("s-shrink-0", extraClass)}>{visual}</span>;
      }
      return <Icon visual={visual} size={iconSize} className={extraClass} />;
    };

    const content = (
      <>
        {isLoading ? (
          <Spinner size="xs" variant="mono" />
        ) : (
          icon && renderIcon(icon, iconShadow)
        )}
        {label && (
          <span className={cn(hasTextShadow && TEXT_SHADOW)}>{label}</span>
        )}
        {showCounter && (
          <Counter
            value={Number(counterValue)}
            variant="primary"
            size={COUNTER_SIZE_MAP[size]}
            isInButton={true}
          />
        )}
        {!isLoading && iconRight && renderIcon(iconRight, iconShadow)}
        {isSelect && (
          <Icon
            visual={ChevronDown}
            size={iconSize}
            className={variant ? chevronVariantMap[variant] : ""}
          />
        )}
      </>
    );

    const pointerEventProps = React.useMemo(() => {
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

    // Disabled/loading buttons must not navigate: render a real <button> and
    // skip the LinkWrapper below.
    const isInteractive = !props.disabled && !isLoading;
    const shouldUseSlot = !!href && isInteractive;
    const Comp = shouldUseSlot ? Slot : "button";

    const innerButton = (
      <Comp
        ref={ref}
        className={cn(
          buttonVariants({
            variant,
            size,
            rounded: isRounded ? "full" : size,
            isIconOnly,
            press: !isMenuTrigger,
          }),
          isPulsing && "s-animate-ring-pulse",
          className
        )}
        disabled={isLoading || props.disabled}
        aria-label={ariaLabel || tooltip || label}
        {...props}
        {...pointerEventProps}
      >
        {shouldUseSlot ? <span>{content}</span> : content}
      </Comp>
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

    return href && isInteractive ? (
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

export { Button, buttonVariants };
