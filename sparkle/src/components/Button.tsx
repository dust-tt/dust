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
import { cva } from "class-variance-authority";
import * as React from "react";

// Redesigned button alongside the existing Button (unchanged). Sizes: 24/32/40px.
// Dark-mode strategy per variant:
//   - primary/outline: explicit dark: gradient overrides (primary goes lighter, outline darker)
//   - highlight/warning: explicit dark: overrides to preserve hue (token ramp would flip to wrong shade)
//   - ghost variants: semantic tokens auto-flip, no dark: needed

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

// Inset white catch-light + hairline via border-dark + ambient drop via foreground.
// All three auto-invert in dark mode via flipping tokens except the white highlight (intentional).
const RAISED_SHADOW =
  "shadow-[inset_0_0_1px_0_rgba(255,255,255,0.08),0_0_0.5px_0_var(--color-border-dark),0_1px_1.5px_0_color-mix(in_oklch,var(--color-foreground)_10%,transparent)]";

// Per-variant (not base) so ghost variants keep ::after free for consumers (e.g. Tabs).
const OVERLAY = cn(
  "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit]",
  "after:transition-colors disabled:after:hidden"
);

const buttonVariants = cva(
  cn(
    "relative isolate inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap",
    // `transform` stays in the transition list for the `press` scale.
    "transition-[color,background-color,border-color,transform] duration-100 ease-out",
    "motion-reduce:transition-none",
    "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring focus-visible:ring-offset-0",
    "group-focus-visible/button-link:ring-2 group-focus-visible/button-link:ring-inset group-focus-visible/button-link:ring-ring",
    // data-disabled is set only when truly disabled (not loading), so loading buttons
    // keep their full-color active look while :disabled guards block interaction for both.
    "data-[disabled]:shadow-none",
    "disabled:cursor-not-allowed disabled:focus-visible:ring-0"
  ),
  {
    variants: {
      variant: {
        primary: cn(
          OVERLAY,
          "bg-linear-to-b from-primary-700 to-primary-800",
          "dark:from-stone-50 dark:to-stone-150",
          "text-primary-50",
          RAISED_SHADOW,
          "data-[disabled]:from-primary-300 data-[disabled]:to-primary-400",
          "dark:data-[disabled]:opacity-50",
          // Dark: light button surface → darken on hover instead of lighten.
          // Dark: light button → drop shadow uses black (not white foreground token) to avoid glow.
          "dark:shadow-[inset_0_0_1px_0_rgba(255,255,255,0.5),0_0_0.5px_0_var(--color-border-dark),0_1px_1.5px_0_rgba(0,0,0,0.1)]",
          "dark:hover:after:bg-black/[0.04] dark:active:after:bg-black/[0.04]"
        ),
        highlight: cn(
          OVERLAY,
          "bg-linear-to-b from-highlight-400 to-highlight-500",
          "dark:from-blue-500 dark:to-blue-600",
          "text-white",
          RAISED_SHADOW,
          "dark:shadow-[inset_0_0_1px_0_rgba(255,255,255,0.08),0_0_0.5px_0_var(--color-border-dark),0_1px_1.5px_0_rgba(0,0,0,0.1)]",
          "data-[disabled]:from-highlight-200 data-[disabled]:to-highlight-300",
          // Dark disabled: lock gradient (prevent ramp flip) then fade with opacity.
          "dark:data-[disabled]:from-highlight-600 dark:data-[disabled]:to-highlight-500",
          "dark:data-[disabled]:opacity-50"
        ),
        warning: cn(
          OVERLAY,
          "bg-linear-to-b from-warning-400 to-warning-500",
          "dark:from-red-500 dark:to-red-600",
          "text-white",
          RAISED_SHADOW,
          "dark:shadow-[inset_0_0_1px_0_rgba(255,255,255,0.08),0_0_0.5px_0_var(--color-border-dark),0_1px_1.5px_0_rgba(0,0,0,0.1)]",
          "data-[disabled]:from-warning-200 data-[disabled]:to-warning-300",
          // Dark disabled: lock gradient (prevent ramp flip) then fade with opacity.
          "dark:data-[disabled]:from-warning-600 dark:data-[disabled]:to-warning-500",
          "dark:data-[disabled]:opacity-50"
        ),
        outline: cn(
          OVERLAY,
          // overflow-hidden + after:rounded-none clips the hover overlay flush to the border-radius.
          "overflow-hidden after:rounded-none",
          "border border-border-dark dark:border-stone-775",
          "bg-linear-to-b from-primary-50 to-primary-100",
          "dark:from-stone-800 dark:to-stone-800",
          "text-muted-foreground dark:text-primary-900",
          "shadow-[inset_0_0_1px_0_rgba(255,255,255,0.08),0_0_0.5px_0_var(--color-border-dark),0_0.5px_1px_0_rgba(0,0,0,0.06)]",
          "hover:after:bg-black/[0.02] active:after:bg-black/[0.02]",
          "data-[disabled]:text-faint",
          "dark:data-[disabled]:opacity-50"
        ),
        ghost: cn(
          "text-foreground",
          "hover:bg-black/[0.02] active:bg-black/[0.02]",
          "dark:hover:bg-white/[0.08] dark:active:bg-white/[0.08]",
          "data-[disabled]:text-faint",
          "disabled:hover:bg-transparent dark:disabled:hover:bg-transparent"
        ),
        "ghost-secondary": cn(
          "text-muted-foreground",
          "hover:bg-black/[0.02] active:bg-black/[0.02]",
          "dark:hover:bg-white/[0.08] dark:active:bg-white/[0.08]",
          "data-[disabled]:text-faint",
          "disabled:hover:bg-transparent dark:disabled:hover:bg-transparent"
        ),
        "highlight-ghost": cn(
          "text-highlight-500",
          "hover:bg-highlight-50 active:bg-highlight-50",
          "data-[disabled]:text-highlight-muted",
          "disabled:hover:bg-transparent"
        ),
        "warning-ghost": cn(
          "text-warning-500",
          "hover:bg-warning-50 active:bg-warning-50",
          "data-[disabled]:text-warning-muted",
          "disabled:hover:bg-transparent"
        ),
      },
      size: {
        xs: "h-6 gap-1.5 px-2 text-sm font-medium leading-4 tracking-[-0.28px] rounded-[9px]",
        sm: "h-8 gap-1.5 px-3 text-sm font-medium tracking-[-0.28px] rounded-xl",
        md: "h-10 gap-1.5 px-4 text-base font-medium tracking-[-0.32px] rounded-[15px]",
      },
      isIconOnly: {
        true: "",
        false: "",
      },
      press: {
        true: "active:scale-[0.985] motion-reduce:active:scale-100",
        false: "",
      },
      pressed: {
        true: "",
        false: "",
      },
    },
    compoundVariants: [
      // Pressed (toggle on): ghost variants keep a persistent background, a step above hover.
      // Raised variants already have one, so `isPressed` only sets aria-pressed there.
      {
        variant: ["ghost", "ghost-secondary"],
        pressed: true,
        className:
          "bg-black/[0.06] hover:bg-black/[0.06] dark:bg-white/[0.12] dark:hover:bg-white/[0.12]",
      },
      {
        variant: "highlight-ghost",
        pressed: true,
        className: "bg-highlight-50",
      },
      {
        variant: "warning-ghost",
        pressed: true,
        className: "bg-warning-50",
      },
      { size: "xs", isIconOnly: true, className: "w-6 px-0" },
      { size: "sm", isIconOnly: true, className: "w-8 px-0" },
      { size: "md", isIconOnly: true, className: "w-10 px-0" },
      // Solid raised variants: larger buttons get a stronger white overlay (Figma spec).
      // dark:hover on primary is overridden per-variant to darken instead of lighten.
      {
        variant: ["primary", "highlight", "warning"],
        size: ["xs", "sm"],
        className: "hover:after:bg-white/10 active:after:bg-white/10",
      },
      {
        variant: ["primary", "highlight", "warning"],
        size: "md",
        className: "hover:after:bg-white/20 active:after:bg-white/20",
      },
      // Outline dark: white overlay (dark surface needs lighten, not darken).
      {
        variant: "outline",
        size: ["xs", "sm", "md"],
        className:
          "dark:hover:after:bg-white/[0.02] dark:active:after:bg-white/[0.02]",
      },
    ],
    defaultVariants: {
      variant: "primary",
      size: "sm",
      isIconOnly: false,
      press: true,
      pressed: false,
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
const ICON_SHADOW = "drop-shadow-[0px_1px_0.75px_rgba(0,0,0,0.08)]";

const INTERNAL_ICON_SIZE_MAP: Record<ButtonSizeType, "xs" | "sm"> = {
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
  // primary swaps to a light button in dark mode, so its chevron tracks the
  // flipping text token rather than a fixed white.
  primary: "text-primary-50/60",
  highlight: "text-white/60",
  warning: "text-white/60",
  outline: "text-faint",
  ghost: "text-faint",
  "ghost-secondary": "text-faint",
  "highlight-ghost": "text-highlight-400",
  "warning-ghost": "text-warning-400",
};

// Loading spinner color, matched to each variant's text color (including the
// dark-mode swap: `revert` = light spinner on light theme, `mono` = the
// inverse). Keeps the spinner the same color as the label.
const spinnerVariantMap: Record<
  ButtonVariantType,
  React.ComponentProps<typeof Spinner>["variant"]
> = {
  primary: "revert",
  highlight: "light",
  warning: "light",
  outline: "mono",
  ghost: "mono",
  "ghost-secondary": "mono",
  "highlight-ghost": "blue500",
  "warning-ghost": "red500",
};

export type ButtonIconType = React.ComponentType | React.ReactElement;

function isReactElement(visual: ButtonIconType): visual is React.ReactElement {
  return React.isValidElement(visual);
}

// Backward-compat aliases and mappings for internal sparkle components that
// previously imported from the old Button.tsx. No other files need to change.
type LegacyButtonSizeType = "icon" | "icon-xs" | "icon-sm" | "mini" | "xmini";
type LegacyButtonVariantType = "highlight-secondary" | "warning-secondary";

const LEGACY_SIZE_MAP: Record<LegacyButtonSizeType, ButtonSizeType> = {
  icon: "sm",
  "icon-xs": "xs",
  "icon-sm": "md",
  mini: "sm",
  xmini: "xs",
};

const LEGACY_VARIANT_MAP: Record<LegacyButtonVariantType, ButtonVariantType> = {
  "highlight-secondary": "highlight-ghost",
  "warning-secondary": "warning-ghost",
};

export const ICON_SIZE_MAP: Record<ButtonSizeType, ButtonSizeType> = {
  xs: "xs",
  sm: "sm",
  md: "md",
};

export type RegularButtonSize = ButtonSizeType;
export type IconOnlyButtonProps = ButtonProps;
export type RegularButtonProps = ButtonProps;

export interface ButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "size">,
    Omit<LinkWrapperProps, "children" | "className"> {
  /** Button size (`xs` / `sm` / `md`); legacy sizes (`icon`, `mini`, ...) are remapped. */
  size?: ButtonSizeType | LegacyButtonSizeType;
  /** Visual style; legacy `*-secondary` variants remap to their `*-ghost` equivalents. */
  variant?: ButtonVariantType | LegacyButtonVariantType;
  /** Legacy no-op kept for backward compatibility. */
  hasLighterFont?: boolean;
  /** Render fully round (pill) corners. */
  isRounded?: boolean;
  /** Button text; omit it (with an `icon`) for an icon-only button. */
  label?: string;
  /** Leading icon component or element. */
  icon?: ButtonIconType;
  /** Trailing icon component or element. */
  iconRight?: ButtonIconType;
  /** Append a dropdown chevron, marking the button as a menu trigger. */
  isSelect?: boolean;
  /** Toggle state for buttons that open or close something: sets `aria-pressed` and, on ghost variants, keeps the background on. */
  isPressed?: boolean;
  /** Show a centered spinner and block interaction while keeping the resting size. */
  isLoading?: boolean;
  /** Show an inline Counter (requires `counterValue`). */
  isCounter?: boolean;
  /** Value displayed in the inline counter. */
  counterValue?: string;
  /** Pulse the button's ring to draw attention. */
  isPulsing?: boolean;
  /** Tooltip label; required for icon-only buttons. */
  tooltip?: string;
  /** Keyboard shortcut hint displayed in the tooltip. */
  tooltipShortcut?: string;
}

/**
 * Lets users trigger an action or event — submitting a form, opening a dialog, or
 * confirming a choice — in several visual variants and three sizes (xs / sm / md),
 * with leading/trailing icons, loading, disabled and pressed (`isPressed`) states,
 * an inline counter, and a dropdown-chevron affordance (`isSelect`). Use a single `highlight` button per
 * view with `outline` or ghost variants for secondary actions; give icon-only
 * buttons a `tooltip` and set `isLoading` during async work.
 * @summary Action button.
 */
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
      isPressed,
      isLoading = false,
      isCounter = false,
      counterValue,
      isPulsing = false,
      isRounded = false,
      tooltip,
      tooltipShortcut,
      href,
      target,
      rel,
      replace,
      shallow,
      "aria-label": ariaLabel,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      hasLighterFont: _hasLighterFont,
      ...props
    },
    ref
  ) => {
    const normalizedSize: ButtonSizeType =
      size != null && size in LEGACY_SIZE_MAP
        ? LEGACY_SIZE_MAP[size as LegacyButtonSizeType]
        : ((size as ButtonSizeType) ?? "sm");
    const normalizedVariant: ButtonVariantType =
      variant != null && variant in LEGACY_VARIANT_MAP
        ? LEGACY_VARIANT_MAP[variant as LegacyButtonVariantType]
        : ((variant as ButtonVariantType) ?? "primary");
    const iconSize = INTERNAL_ICON_SIZE_MAP[normalizedSize];
    const showCounter = isCounter && counterValue != null;
    const isIconOnly = !label && !showCounter && !isSelect && !!icon;
    // Menu triggers (dropdown/popover/select) skip the press scale, else the
    // opening menu jumps with the anchor. Radix sets aria-haspopup on the
    // trigger; isSelect is our chevron affordance. Tooltips don't, so they keep it.
    const isMenuTrigger = isSelect || props["aria-haspopup"] != null;
    const hasTextShadow =
      normalizedVariant != null && RAISED_VARIANTS.includes(normalizedVariant);
    const iconShadow = hasTextShadow ? ICON_SHADOW : "";

    const renderIcon = (visual: ButtonIconType, extraClass = "") => {
      if (isReactElement(visual)) {
        return <span className={cn("shrink-0", extraClass)}>{visual}</span>;
      }
      return <Icon visual={visual} size={iconSize} className={extraClass} />;
    };

    const restingContent = (
      <>
        {icon && renderIcon(icon, iconShadow)}
        {label && (
          <span className={cn(hasTextShadow && TEXT_SHADOW)}>{label}</span>
        )}
        {showCounter && (
          <Counter
            value={Number(counterValue)}
            variant="primary"
            size={COUNTER_SIZE_MAP[normalizedSize]}
            isInButton={true}
          />
        )}
        {iconRight && renderIcon(iconRight, iconShadow)}
        {isSelect && (
          <Icon
            visual={ChevronDown}
            size={iconSize}
            className={
              normalizedVariant ? chevronVariantMap[normalizedVariant] : ""
            }
          />
        )}
      </>
    );

    // Loading keeps the button at its resting size: the normal content stays
    // in the layout but invisible, and a centered spinner overlays it.
    const content = isLoading ? (
      <>
        <span className="absolute inset-0 flex items-center justify-center">
          <Spinner size="xs" variant={spinnerVariantMap[normalizedVariant]} />
        </span>
        <span
          aria-hidden="true"
          className="invisible flex items-center gap-[inherit]"
        >
          {restingContent}
        </span>
      </>
    ) : (
      restingContent
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
            variant: normalizedVariant,
            size: normalizedSize,
            isIconOnly,
            press: !isMenuTrigger && !isLoading,
            pressed: isPressed === true,
          }),
          isPulsing && "animate-ring-pulse-soft",
          isRounded && "rounded-full",
          isLoading && "relative",
          className
        )}
        aria-label={ariaLabel || tooltip || label}
        aria-pressed={isPressed}
        {...props}
        // Loading blocks interaction (disabled attr) but keeps the active look:
        // the muted `data-[disabled]:` styles are gated on this attribute, which
        // is set only when truly disabled — so a loading button stays full-color
        // and its spinner matches the label. Set after {...props} so a
        // consumer-passed `disabled` can't clobber the computed value.
        disabled={isLoading || props.disabled}
        data-disabled={props.disabled && !isLoading ? "" : undefined}
        aria-busy={isLoading || undefined}
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
        className="group/button-link focus-visible:outline-hidden"
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
