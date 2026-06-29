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
// renders the other's light design); other variants are unchanged apart from
// ghost text/hover tints, which flip via -night tokens.

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

// The shadow shared by every raised button: a tinted 0.5px outline, a drop,
// and a faint inset highlight. The outline hex is literal because arbitrary
// shadows can't reference theme tokens.
const SOLID_SHADOW = (outline: string) =>
  `s-shadow-[inset_0_0_1px_0_rgba(255,255,255,0.08),0_0_0.5px_0_${outline},0_1px_1.5px_0_rgba(0,0,0,0.10)]`;

// Hover/active overlay for the raised variants. Per-variant (not in the base)
// so ghost variants leave the ::after pseudo free for consumers (e.g. Tabs).
const OVERLAY = cn(
  "after:s-pointer-events-none after:s-absolute after:s-inset-0 after:s-rounded-[inherit]",
  "after:s-transition-colors disabled:after:s-hidden"
);

// `dark:` shadow literals for the primary/outline swap, spelled out (not a
// computed prefix) so Tailwind's JIT emits them.
const DARK_OUTLINE_SHADOW =
  "dark:s-shadow-[inset_0_0_1px_0_rgba(255,255,255,0.08),0_0_0.5px_0_#DFE0E2,0_1px_1.5px_0_rgba(0,0,0,0.10)]";
const DARK_SOLID_SHADOW =
  "dark:s-shadow-[inset_0_0_1px_0_rgba(255,255,255,0.08),0_0_0.5px_0_#364153,0_1px_1.5px_0_rgba(0,0,0,0.10)]";

const newButtonVariants = cva(
  cn(
    "s-relative s-isolate s-inline-flex s-shrink-0 s-select-none s-items-center s-justify-center s-whitespace-nowrap",
    // `transform` stays in the transition list for the `press` scale.
    "s-transition-[color,background-color,border-color,transform] s-duration-100 s-ease-out",
    "motion-reduce:s-transition-none",
    "focus-visible:s-outline-none focus-visible:s-ring-2 focus-visible:s-ring-ring focus-visible:s-ring-offset-0",
    // Disabled styling is per-variant (below), not a blanket opacity. Disabled
    // buttons must not show a focus ring.
    "disabled:s-cursor-not-allowed disabled:focus-visible:s-ring-0"
  ),
  {
    variants: {
      variant: {
        primary: cn(
          OVERLAY,
          "s-bg-gradient-to-b s-from-stone-700 s-to-stone-800",
          "s-text-white",
          SOLID_SHADOW("#364153"),
          "disabled:s-from-stone-300 disabled:s-to-stone-400 disabled:s-shadow-none",
          "dark:s-border dark:s-border-border-dark",
          "dark:s-from-white dark:s-to-stone-50 dark:s-text-muted-foreground",
          DARK_OUTLINE_SHADOW,
          "dark:hover:after:s-bg-gray-950/[0.02] dark:active:after:s-bg-gray-950/[0.02]",
          "dark:disabled:s-from-white dark:disabled:s-to-stone-50 dark:disabled:s-shadow-none dark:disabled:s-text-faint"
        ),
        highlight: cn(
          OVERLAY,
          "s-bg-gradient-to-b s-from-highlight-400 s-to-highlight-500",
          "s-text-white",
          SOLID_SHADOW("#4BABFF"),
          "disabled:s-from-highlight-200 disabled:s-to-highlight-300 disabled:s-shadow-none"
        ),
        warning: cn(
          OVERLAY,
          "s-bg-gradient-to-b s-from-red-400 s-to-red-500",
          "s-text-white",
          SOLID_SHADOW("#E76449"),
          "disabled:s-from-red-200 disabled:s-to-red-300 disabled:s-shadow-none"
        ),
        outline: cn(
          OVERLAY,
          "s-border s-border-border-dark",
          "s-bg-gradient-to-b s-from-white s-to-stone-50",
          "s-text-muted-foreground",
          SOLID_SHADOW("#DFE0E2"),
          "hover:after:s-bg-gray-950/[0.02] active:after:s-bg-gray-950/[0.02]",
          "disabled:s-shadow-none disabled:s-text-faint",
          "dark:s-border-0 dark:s-from-stone-700 dark:s-to-stone-800 dark:s-text-white",
          DARK_SOLID_SHADOW,
          "dark:disabled:s-from-stone-300 dark:disabled:s-to-stone-400 dark:disabled:s-text-white dark:disabled:s-shadow-none"
        ),
        ghost: cn(
          "s-text-foreground dark:s-text-foreground-night",
          "hover:s-bg-black/[0.02] active:s-bg-black/[0.02]",
          "dark:hover:s-bg-white/[0.08] dark:active:s-bg-white/[0.08]",
          "disabled:s-text-faint dark:disabled:s-text-faint-night",
          "disabled:hover:s-bg-transparent dark:disabled:hover:s-bg-transparent"
        ),
        "ghost-secondary": cn(
          "s-text-muted-foreground dark:s-text-muted-foreground-night",
          "hover:s-bg-black/[0.02] active:s-bg-black/[0.02]",
          "dark:hover:s-bg-white/[0.08] dark:active:s-bg-white/[0.08]",
          "disabled:s-text-faint dark:disabled:s-text-faint-night",
          "disabled:hover:s-bg-transparent dark:disabled:hover:s-bg-transparent"
        ),
        "highlight-ghost": cn(
          "s-text-highlight-500 dark:s-text-highlight-500-night",
          "hover:s-bg-highlight-50 active:s-bg-highlight-50",
          "dark:hover:s-bg-highlight-50-night dark:active:s-bg-highlight-50-night",
          "disabled:s-text-highlight-muted",
          "disabled:hover:s-bg-transparent dark:disabled:hover:s-bg-transparent"
        ),
        "warning-ghost": cn(
          "s-text-red-500",
          "hover:s-bg-red-50 active:s-bg-red-50",
          "dark:hover:s-bg-warning-50-night dark:active:s-bg-warning-50-night",
          "disabled:s-text-warning-muted",
          "disabled:hover:s-bg-transparent dark:disabled:hover:s-bg-transparent"
        ),
      },
      size: {
        xs: "s-h-6 s-gap-1.5 s-px-2 s-text-sm s-font-medium s-leading-4 s-tracking-[-0.28px] s-rounded-[9px]",
        sm: "s-h-8 s-gap-1.5 s-px-3 s-text-sm s-font-medium s-tracking-[-0.28px] s-rounded-xl",
        md: "s-h-10 s-gap-1.5 s-px-4 s-text-base s-font-medium s-tracking-[-0.32px] s-rounded-[15px]",
      },
      isIconOnly: {
        true: "",
        false: "",
      },
      press: {
        true: "active:s-scale-[0.985] motion-reduce:active:s-scale-100",
        false: "",
      },
    },
    compoundVariants: [
      { size: "xs", isIconOnly: true, className: "s-w-6 s-px-0" },
      { size: "sm", isIconOnly: true, className: "s-w-8 s-px-0" },
      { size: "md", isIconOnly: true, className: "s-w-10 s-px-0" },
      // White overlay on solid variants: large buttons get a stronger tint
      // (Figma uses white/0.2 at Large, white/0.1 at Small/Medium). Hover and
      // active share the same value — only the press scale differentiates them.
      {
        variant: ["primary", "highlight", "warning"],
        size: ["xs", "sm"],
        className: "hover:after:s-bg-white/10 active:after:s-bg-white/10",
      },
      {
        variant: ["primary", "highlight", "warning"],
        size: "md",
        className: "hover:after:s-bg-white/20 active:after:s-bg-white/20",
      },
      // Outline renders as a dark solid in dark mode, so it follows the same
      // size rule for its (dark-only) white overlay.
      {
        variant: "outline",
        size: ["xs", "sm"],
        className:
          "dark:hover:after:s-bg-white/10 dark:active:after:s-bg-white/10",
      },
      {
        variant: "outline",
        size: "md",
        className:
          "dark:hover:after:s-bg-white/20 dark:active:after:s-bg-white/20",
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
const ICON_SHADOW = "s-drop-shadow-[0px_1px_0.75px_rgba(0,0,0,0.08)]";

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
  primary: "s-text-white/60",
  highlight: "s-text-white/60",
  warning: "s-text-white/60",
  outline: "s-text-faint",
  ghost: "s-text-faint",
  "ghost-secondary": "s-text-faint",
  "highlight-ghost": "s-text-highlight-400",
  "warning-ghost": "s-text-warning-400",
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
        return <span className={cn("s-shrink-0", extraClass)}>{visual}</span>;
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
          isPulsing && "s-animate-ring-pulse-soft",
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

NewButton.displayName = "NewButton";

export { NewButton, newButtonVariants };
