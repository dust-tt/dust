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

// New button design (Figma "Product - WIP" > Controls & input > Button).
// Replaces Button incrementally: sizes follow the new S/M/L control scale
// (24/32/40px) where every old size maps one step down (md->lg, sm->md,
// xs/mini/xmini->sm). Dark mode is an interim pass built from the palette's
// auto-generated `-night` ramp mirror ({shade}-night = ramp[1000-shade]); it is
// internally consistent but not yet reconciled with the designer's dark spec.

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

export const BUTTON_SIZES = ["sm", "md", "lg"] as const;
export type ButtonSizeType = (typeof BUTTON_SIZES)[number];

// Shadow recipe from the design: a 0.5px outline shadow tinted per variant, a
// soft drop shadow, and a faint white inset highlight. The hex stops match
// tokens in lib/colors.ts (blue-400, gray-700, border-dark) — arbitrary
// shadows cannot reference theme colors.
const SOLID_SHADOW = (outline: string) =>
  `s-shadow-[inset_0_0_1px_0_rgba(255,255,255,0.08),0_0_0.5px_0_${outline},0_1px_1.5px_0_rgba(0,0,0,0.10)]`;
const OUTLINE_SHADOW =
  "s-shadow-[inset_0_0_1px_0_rgba(255,255,255,0.08),0_0_0.5px_0_#DFE0E2,0_0.5px_1px_0_rgba(0,0,0,0.06)]";

// Hover/active overlay layered on the gradient for the raised variants (the
// design brightens or dims the same fill instead of swapping colors). Applied
// per-variant, NOT in the base, so the ghost variants leave the ::after pseudo
// free for consumers that compose their own (e.g. the Tabs active underline).
const OVERLAY = cn(
  "after:s-pointer-events-none after:s-absolute after:s-inset-0 after:s-rounded-[inherit]",
  "after:s-transition-colors disabled:after:s-hidden"
);

const buttonVariants = cva(
  cn(
    "s-relative s-isolate s-inline-flex s-shrink-0 s-select-none s-items-center s-justify-center s-whitespace-nowrap",
    // Press feedback (scale 0.97 on :active) is added by the `press` variant.
    // It is disabled for dropdown/popover/select triggers: the button is then
    // the floating menu's anchor and Floating UI tracks its rendered rect, so
    // scaling it makes the menu jump as it opens. `transform` stays in the
    // transition list so the press eases in/out when the variant enables it.
    "s-transition-[color,background-color,border-color,transform] s-duration-150 s-ease-out",
    "motion-reduce:s-transition-none",
    "focus-visible:s-outline-none focus-visible:s-ring-2 focus-visible:s-ring-ring focus-visible:s-ring-offset-0",
    // Disabled is a per-variant recipe (lighter fill / muted text / no shadow),
    // applied in each variant below — not a blanket opacity.
    "disabled:s-cursor-not-allowed"
  ),
  {
    variants: {
      variant: {
        primary: cn(
          OVERLAY,
          // Dark = the ramp mirror (-night): the neutral fill flips light, so the
          // text flips dark (as the legacy button did). Disabled mirrors the
          // other way (dark fill) and needs muted light text.
          "s-bg-gradient-to-b s-from-stone-700 s-to-stone-800",
          "dark:s-from-stone-700-night dark:s-to-stone-800-night",
          "s-text-white dark:s-text-foreground",
          SOLID_SHADOW("#44403b"),
          "hover:after:s-bg-white/10 active:after:s-bg-black/10",
          "disabled:s-from-stone-300 disabled:s-to-stone-400 disabled:s-shadow-none",
          "dark:disabled:s-from-stone-300-night dark:disabled:s-to-stone-400-night dark:disabled:s-text-faint-night"
        ),
        highlight: cn(
          OVERLAY,
          // Dark = ramp mirror (-night): blue stays saturated, white text holds.
          "s-bg-gradient-to-b s-from-blue-400 s-to-blue-500",
          "dark:s-from-blue-400-night dark:s-to-blue-500-night",
          "s-text-white",
          SOLID_SHADOW("#4BABFF"),
          "hover:after:s-bg-white/10 active:after:s-bg-black/10",
          "disabled:s-from-blue-200 disabled:s-to-blue-300 disabled:s-shadow-none",
          "dark:disabled:s-from-blue-200-night dark:disabled:s-to-blue-300-night"
        ),
        warning: cn(
          OVERLAY,
          // The design's "critical" reds come from the preset's red palette
          // (red-400/500), not the rose ramp the legacy warning variant uses.
          "s-bg-gradient-to-b s-from-red-400 s-to-red-500",
          "dark:s-from-red-400-night dark:s-to-red-500-night",
          "s-text-white",
          SOLID_SHADOW("#E76449"),
          "hover:after:s-bg-white/10 active:after:s-bg-black/10",
          "disabled:s-from-red-200 disabled:s-to-red-300 disabled:s-shadow-none",
          "dark:disabled:s-from-red-200-night dark:disabled:s-to-red-300-night"
        ),
        outline: cn(
          OVERLAY,
          "s-border s-border-border-dark dark:s-border-border-dark-night",
          "s-bg-gradient-to-b s-from-white s-to-stone-50",
          "dark:s-from-gray-800 dark:s-to-gray-900",
          "s-text-muted-foreground dark:s-text-muted-foreground-night",
          OUTLINE_SHADOW,
          "hover:after:s-bg-gray-950/[0.02] active:after:s-bg-gray-950/[0.04]",
          "disabled:s-shadow-none disabled:s-text-faint dark:disabled:s-text-faint-night"
        ),
        ghost: cn(
          "s-text-foreground dark:s-text-foreground-night",
          "hover:s-bg-stone-200 active:s-bg-stone-300",
          "dark:hover:s-bg-stone-200-night dark:active:s-bg-stone-300-night",
          "disabled:s-text-faint dark:disabled:s-text-faint-night",
          "disabled:hover:s-bg-transparent dark:disabled:hover:s-bg-transparent"
        ),
        "ghost-secondary": cn(
          "s-text-muted-foreground dark:s-text-muted-foreground-night",
          "hover:s-bg-stone-200 active:s-bg-stone-300",
          "dark:hover:s-bg-stone-200-night dark:active:s-bg-stone-300-night",
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
        sm: "s-h-6 s-gap-1.5 s-px-2 s-text-sm s-font-medium s-tracking-[-0.28px]",
        md: "s-h-8 s-gap-1.5 s-px-3 s-text-sm s-font-medium s-tracking-[-0.28px]",
        lg: "s-h-10 s-gap-1.5 s-px-4 s-text-base s-font-medium s-tracking-[-0.32px]",
      },
      // Kept separate from size: twMerge is not configured for the s- prefix,
      // so emitting both a size radius and s-rounded-full would leave CSS
      // order to decide which wins.
      rounded: {
        sm: "s-rounded-[9px]",
        md: "s-rounded-xl",
        lg: "s-rounded-[15px]",
        full: "s-rounded-full",
      },
      isIconOnly: {
        true: "",
        false: "",
      },
      // Press feedback. Turned off for menu triggers (see base comment).
      press: {
        true: "active:s-scale-[0.97] motion-reduce:active:s-scale-100",
        false: "",
      },
    },
    compoundVariants: [
      { size: "sm", isIconOnly: true, className: "s-w-6 s-px-0" },
      { size: "md", isIconOnly: true, className: "s-w-8 s-px-0" },
      { size: "lg", isIconOnly: true, className: "s-w-10 s-px-0" },
    ],
    defaultVariants: {
      variant: "primary",
      size: "md",
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
// Canonical icon shadow (Figma node 11109:58782). Older frames carried a
// heavier 4-layer drop-shadow that the designer has since corrected to this.
const ICON_SHADOW = "s-drop-shadow-[0px_1px_0.75px_rgba(0,0,0,0.08)]";

const ICON_SIZE_MAP: Record<ButtonSizeType, "xs" | "sm"> = {
  sm: "xs",
  md: "xs",
  lg: "sm",
};

const COUNTER_SIZE_MAP: Record<ButtonSizeType, "xs" | "sm"> = {
  sm: "xs",
  md: "xs",
  lg: "sm",
};

type SpinnerVariant = NonNullable<SpinnerProps["variant"]>;

// A loading button is also `disabled`, which now renders the pale disabled
// fill — so the spinner always sits on a light background. Use the dark "mono"
// spinner across the board so it stays visible (a white spinner would vanish
// on the pale disabled gradient).
const spinnerVariantsMap: Record<ButtonVariantType, SpinnerVariant> = {
  primary: "mono",
  highlight: "mono",
  warning: "mono",
  outline: "mono",
  ghost: "mono",
  "ghost-secondary": "mono",
  "highlight-ghost": "mono",
  "warning-ghost": "mono",
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
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      label,
      icon,
      iconRight,
      className,
      variant = "primary",
      size = "md",
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
    // A dropdown/popover/select trigger anchors a floating menu; pressing it
    // would scale the anchor and make the menu jump as it opens. Radix merges
    // `aria-haspopup` onto the trigger (via asChild), and `isSelect` is our own
    // chevron affordance — either means "no press scale". Tooltips do NOT set
    // aria-haspopup, so tooltip buttons keep the press.
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
          <Spinner
            size="xs"
            variant={(variant && spinnerVariantsMap[variant]) || "mono"}
          />
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

    const shouldUseSlot = !!href && !props.disabled;
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
            // No press scale on menu triggers: scaling the trigger makes the
            // opening dropdown/popover jump (Floating UI tracks the anchor box).
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

export { Button, buttonVariants };
