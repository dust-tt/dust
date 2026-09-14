import { AnimatedText } from "@sparkle/components/AnimatedText";
import {
  LinkWrapper,
  type LinkWrapperProps,
} from "@sparkle/components/LinkWrapper";
import { XClose } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import { cva } from "class-variance-authority";
import React, { type ComponentType, type ReactNode } from "react";
import { Icon, type IconProps } from "./Icon";

export const CHIP_SIZES = ["mini", "xs", "sm"] as const;

type ChipSizeType = (typeof CHIP_SIZES)[number];

export const CHIP_COLORS = [
  "primary",
  "success",
  "warning",
  "info",
  "highlight",
] as const;

type ChipColorType = (typeof CHIP_COLORS)[number];

const chipVariants = cva("inline-flex box-border items-center", {
  variants: {
    size: {
      mini: "rounded-lg min-h-5 text-xs font-medium px-1.5 gap-1",
      xs: "rounded-[9px] min-h-6 heading-xs px-[9px] gap-1",
      sm: "rounded-xl min-h-8 heading-sm px-3 gap-1.5",
    },
    // Semantic scales (primary/highlight/info/warning) auto-flip in the `.dark`
    // block, so they need no dark variants. `primary` resolves to stone (Figma
    // Badge Grey) via the token layer. `success` is overridden to the emerald
    // palette to match the Figma Badge Green, so it carries dark variants.
    color: {
      primary: cn("bg-primary-50 text-primary-700"),
      success: cn(
        "bg-emerald-50 text-emerald-700",
        "dark:bg-emerald-950 dark:text-emerald-300"
      ),
      warning: cn("bg-warning-50 text-warning-700"),
      info: cn("bg-info-50 text-info-700"),
      highlight: cn("bg-highlight-50 text-highlight-700"),
    },
  },
  defaultVariants: {
    size: "xs",
    color: "primary",
  },
});

const closeIconVariants: Record<ChipColorType, string> = {
  primary: cn(
    "text-primary-700 hover:text-primary-900 active:text-primary-950"
  ),
  highlight: cn(
    "text-highlight-700 hover:text-highlight-900 active:text-highlight-950"
  ),
  success: cn(
    "text-emerald-700 hover:text-emerald-900 active:text-emerald-950",
    "dark:text-emerald-300 dark:hover:text-emerald-100 dark:active:text-emerald-50"
  ),
  warning: cn(
    "text-warning-700 hover:text-warning-900 active:text-warning-950"
  ),
  info: cn("text-info-700 hover:text-info-900 active:text-info-950"),
};

interface ChipInternalButtonProps {
  icon: ComponentType;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  className?: string;
  size?: "xs" | "sm";
  "aria-label"?: string;
}

const ChipButton = React.forwardRef<HTMLButtonElement, ChipInternalButtonProps>(
  ({ icon, onClick, className, size = "xs", "aria-label": ariaLabel }, ref) => (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={cn(
        "rounded-md p-0.5",
        "transition-colors duration-200 motion-reduce:transition-none",
        "focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      <Icon visual={icon} size={size} />
    </button>
  )
);
ChipButton.displayName = "ChipButton";

type ChipBaseProps = {
  size?: ChipSizeType;
  /** Semantic color; use `success`, `warning`, and `info` to match their intent. */
  color?: ChipColorType;
  /** Chip text; keep it to one or two words. */
  label?: string;
  children?: ReactNode;
  className?: string;
  /** Animate the label with a shimmer for transient processing states. */
  isBusy?: boolean;
  /** Leading icon component. */
  icon?: ComponentType;
  /** Invoked when the remove (close) button is clicked; its presence shows the button. */
  onRemove?: () => void;
};

type ChipButtonProps = ChipBaseProps & {
  onClick?: () => void;
} & {
  [K in keyof Omit<LinkWrapperProps, "children" | "className">]?: never;
};

type ChipLinkProps = ChipBaseProps &
  Omit<LinkWrapperProps, "children"> & {
    onClick?: never;
  };

export type ChipProps = ChipLinkProps | ChipButtonProps;

// TODO(yuka: 1606): we should update this component so that you cannot have both
// onClick and onRemove at the same time. We should use div when there is no onClick,
// but use button when there is onClick.
// Since we can have a button inside a button with current implementation, the top level element is a div
// with a role="button", a tabIndex={0} to make it focusable, and onKeyDown handler.
/**
 * A compact, mostly read-only label for surfacing a status, category, or short
 * piece of metadata, in several sizes and semantic colors, with an optional leading
 * icon, a breathing "busy" animation, clickable and removable affordances. Use it
 * for statuses, tags, categories, or active filters; for a primary action, use a
 * Button instead.
 * @summary Status or metadata label.
 */
const Chip = React.forwardRef<HTMLDivElement, ChipProps>(
  (
    {
      size,
      color,
      label,
      children,
      className,
      isBusy,
      icon,
      onRemove,
      onClick,
      href,
      ...linkProps
    }: ChipProps,
    ref
  ) => {
    const chipContent = (
      <div
        className={cn(
          chipVariants({ size, color }),
          className,
          onClick && "cursor-pointer"
        )}
        aria-label={label}
        ref={ref}
        onClick={onClick ? () => onClick() : undefined}
        role={onClick ? "button" : undefined}
        onKeyDown={(e) => {
          if (
            onClick &&
            (e.key === "Enter" || e.key === " ") &&
            e.target === e.currentTarget
          ) {
            onClick();
          }
        }}
        tabIndex={onClick ? 0 : undefined}
      >
        {children}
        {icon && (
          <Icon
            visual={icon}
            size={size === "mini" ? "xs" : (size as IconProps["size"])}
          />
        )}
        {label && (
          <span className={cn("grow truncate", onClick && "cursor-pointer")}>
            {isBusy ? (
              <AnimatedText variant={color}>{label}</AnimatedText>
            ) : (
              label
            )}
          </span>
        )}
        {onRemove && (
          <ChipButton
            icon={XClose}
            size={size === "sm" ? "sm" : "xs"}
            className={cn("-mr-1", closeIconVariants[color || "primary"])}
            aria-label="Remove"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onRemove();
            }}
          />
        )}
      </div>
    );
    return href ? (
      <LinkWrapper href={href} {...linkProps}>
        {chipContent}
      </LinkWrapper>
    ) : (
      chipContent
    );
  }
);

Chip.displayName = "Chip";

export { Chip };
