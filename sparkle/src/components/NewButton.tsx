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

// Redesigned button, added alongside the existing Button (which is unchanged).
// Sizes use a 24/32/40px scale. In dark mode, primary and outline swap (each
// renders the other's light design): both are built from the `primary` token
// ramp, which flips on its own under `.dark`, so the swap needs no `dark:`
// code. Every other variant's colors come from semantic tokens that flip too;
// only the translucent hover/active overlays carry explicit `dark:` values
// (a white tint can't flip through a token).

export const NEW_BUTTON_VARIANTS = [
  "primary",
  "highlight",
  "outline",
  "warning",
  "ghost",
  "ghost-secondary",
  "highlight-ghost",
  "warning-ghost",
] as const;

export type NewButtonVariantType = (typeof NEW_BUTTON_VARIANTS)[number];

export const NEW_BUTTON_SIZES = ["xs", "sm", "md"] as const;
export type NewButtonSizeType = (typeof NEW_BUTTON_SIZES)[number];

// The shadow shared by every raised button: a 0.5px hairline outline, an
// ambient drop, and a faint inset top-highlight. Both tinted layers reference
// flipping tokens so the whole shadow inverts in dark mode with no `dark:`:
//   - hairline -> `border-dark` (light gray in light, dark slate in dark), the
//     exact per-mode tint the primary/outline swap needs.
//   - ambient drop -> `foreground` (dark in light => a normal drop shadow;
//     light in dark => a soft glow), which is how elevation reads on a dark
//     canvas (Emil: alpha-white edges glow, dark drop shadows go muddy).
// The inset highlight stays white: a top catch-light that works in both modes.
const RAISED_SHADOW =
  "shadow-[inset_0_0_1px_0_rgba(255,255,255,0.08),0_0_0.5px_0_var(--color-border-dark),0_1px_1.5px_0_color-mix(in_oklch,var(--color-foreground)_10%,transparent)]";

// Hover/active overlay for the raised variants. Per-variant (not in the base)
// so ghost variants leave the ::after pseudo free for consumers (e.g. Tabs).
const OVERLAY = cn(
  "after:pointer-events-none after:absolute after:inset-0 after:rounded-[inherit]",
  "after:transition-colors disabled:after:hidden"
);

const newButtonVariants = cva(
  cn(
    "relative isolate inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap",
    // `transform` stays in the transition list for the `press` scale.
    "transition-[color,background-color,border-color,transform] duration-100 ease-out",
    "motion-reduce:transition-none",
    "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0",
    // Disabled styling is per-variant (below), not a blanket opacity. Disabled
    // buttons must not show a focus ring.
    "disabled:cursor-not-allowed disabled:focus-visible:ring-0"
  ),
  {
    variants: {
      variant: {
        // Built from the flipping `primary` ramp: dark gradient + light text in
        // light mode, light gradient + dark text in dark mode. That auto-swap
        // is the whole primary/outline relationship — no `dark:` needed.
        primary: cn(
          OVERLAY,
          "bg-linear-to-b from-primary-700 to-primary-800",
          "text-primary-50",
          RAISED_SHADOW,
          "data-[disabled]:from-primary-300 data-[disabled]:to-primary-400 data-[disabled]:shadow-none",
          // Light: dark button -> white overlay (size-based, below). Dark: light
          // button -> a faint dark overlay instead.
          "dark:hover:after:bg-black/[0.04] dark:active:after:bg-black/[0.04]"
        ),
        highlight: cn(
          OVERLAY,
          "bg-linear-to-b from-highlight-400 to-highlight-500",
          "text-white",
          RAISED_SHADOW,
          "data-[disabled]:from-highlight-200 data-[disabled]:to-highlight-300 data-[disabled]:shadow-none"
        ),
        warning: cn(
          OVERLAY,
          "bg-linear-to-b from-red-400 to-red-500",
          "text-white",
          RAISED_SHADOW,
          "data-[disabled]:from-red-200 data-[disabled]:to-red-300 data-[disabled]:shadow-none"
        ),
        // The mirror of primary: light gradient + muted text in light mode,
        // dark gradient + light text in dark mode, via the same flipping ramp.
        outline: cn(
          OVERLAY,
          "border border-border-dark",
          "bg-linear-to-b from-primary-50 to-primary-100",
          "text-muted-foreground",
          RAISED_SHADOW,
          // Light: light button -> faint dark overlay. Dark: dark button ->
          // white overlay (size-based, below).
          "hover:after:bg-black/[0.02] active:after:bg-black/[0.02]",
          "data-[disabled]:shadow-none data-[disabled]:text-faint"
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
    },
    compoundVariants: [
      { size: "xs", isIconOnly: true, className: "w-6 px-0" },
      { size: "sm", isIconOnly: true, className: "w-8 px-0" },
      { size: "md", isIconOnly: true, className: "w-10 px-0" },
      // White overlay on solid variants: large buttons get a stronger tint
      // (Figma uses white/0.2 at Large, white/0.1 at Small/Medium). Hover and
      // active share the same value — only the press scale differentiates them.
      // For primary (which is light in dark mode) the dark-mode override in the
      // variant wins on specificity, so this only applies in light mode there.
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
      // Outline renders as a dark solid in dark mode, so it gets the same
      // size-based white overlay there (its light-mode overlay is in the variant).
      {
        variant: "outline",
        size: ["xs", "sm"],
        className: "dark:hover:after:bg-white/10 dark:active:after:bg-white/10",
      },
      {
        variant: "outline",
        size: "md",
        className: "dark:hover:after:bg-white/20 dark:active:after:bg-white/20",
      },
    ],
    defaultVariants: {
      variant: "primary",
      size: "sm",
      isIconOnly: false,
      press: true,
    },
  }
);

// Labels and icons carry a subtle shadow on raised (non-ghost) variants.
const RAISED_VARIANTS: NewButtonVariantType[] = [
  "primary",
  "highlight",
  "warning",
  "outline",
];
const TEXT_SHADOW = "[text-shadow:0_1px_1.5px_rgba(0,0,0,0.08)]";
const ICON_SHADOW = "drop-shadow-[0px_1px_0.75px_rgba(0,0,0,0.08)]";

const ICON_SIZE_MAP: Record<NewButtonSizeType, "xs" | "sm"> = {
  xs: "xs",
  sm: "xs",
  md: "sm",
};

const COUNTER_SIZE_MAP: Record<NewButtonSizeType, "xs" | "sm"> = {
  xs: "xs",
  sm: "xs",
  md: "sm",
};

const chevronVariantMap: Record<NewButtonVariantType, string> = {
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
  NewButtonVariantType,
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

export type NewButtonIconType = React.ComponentType | React.ReactElement;

function isReactElement(
  visual: NewButtonIconType
): visual is React.ReactElement {
  return React.isValidElement(visual);
}

export interface NewButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "size">,
    Omit<LinkWrapperProps, "children" | "className">,
    Pick<VariantProps<typeof newButtonVariants>, "variant"> {
  size?: NewButtonSizeType;
  label?: string;
  icon?: NewButtonIconType;
  iconRight?: NewButtonIconType;
  isSelect?: boolean;
  isLoading?: boolean;
  isCounter?: boolean;
  counterValue?: string;
  isPulsing?: boolean;
  tooltip?: string;
  tooltipShortcut?: string;
}

const NewButton = React.forwardRef<HTMLButtonElement, NewButtonProps>(
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
    const hasTextShadow = variant != null && RAISED_VARIANTS.includes(variant);
    const iconShadow = hasTextShadow ? ICON_SHADOW : "";

    const renderIcon = (visual: NewButtonIconType, extraClass = "") => {
      if (isReactElement(visual)) {
        return <span className={cn("shrink-0", extraClass)}>{visual}</span>;
      }
      return <Icon visual={visual} size={iconSize} className={extraClass} />;
    };

    const content = (
      <>
        {isLoading ? (
          <Spinner
            size="xs"
            variant={spinnerVariantMap[variant ?? "primary"]}
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

    // Disabled/loading buttons must not navigate: render a real <button> and
    // skip the LinkWrapper below.
    const isInteractive = !props.disabled && !isLoading;
    const shouldUseSlot = !!href && isInteractive;
    const Comp = shouldUseSlot ? Slot : "button";

    const innerButton = (
      <Comp
        ref={ref}
        className={cn(
          newButtonVariants({
            variant,
            size,
            isIconOnly,
            press: !isMenuTrigger,
          }),
          isPulsing && "animate-ring-pulse-soft",
          className
        )}
        aria-label={ariaLabel || tooltip || label}
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

NewButton.displayName = "NewButton";

export { NewButton, newButtonVariants };
