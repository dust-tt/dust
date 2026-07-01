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
  "green",
  "blue",
  "rose",
  "golden",
  "white",
] as const;

type ChipColorType = (typeof CHIP_COLORS)[number];

const chipVariants = cva("inline-flex box-border items-center", {
  variants: {
    size: {
      mini: "rounded-md min-h-5 text-xs font-medium px-1.5 py-1 gap-0.5",
      xs: "rounded-lg min-h-7 heading-xs px-3 gap-1",
      sm: "rounded-xl min-h-9 heading-sm px-4 gap-1.5",
    },
    color: {
      primary: cn("bg-muted-background border-border", "text-primary-900"),
      highlight: cn(
        "bg-highlight-100 border-highlight-200",
        "text-highlight-900"
      ),
      success: cn("bg-success-100 border-success-200", "text-success-900"),
      info: cn("bg-info-100 border-info-200", "text-info-900"),
      warning: cn("bg-warning-100 border-warning-200", "text-warning-900"),
      // The raw palette scales (green/blue/rose/golden) are not redefined in
      // the `.dark` block (unlike the semantic scales above), so they need
      // explicit dark variants to flip. The dark shades mirror the inverted
      // mapping the v3 `-night` shades used (e.g. green-100 -> green-900).
      green: cn(
        "bg-green-100 border-green-200 text-green-900",
        "dark:bg-green-900 dark:border-green-800 dark:text-green-100"
      ),
      blue: cn(
        "bg-blue-100 border-blue-200 text-blue-900",
        "dark:bg-blue-900 dark:border-blue-800 dark:text-blue-100"
      ),
      rose: cn(
        "bg-rose-100 border-rose-200 text-rose-900",
        "dark:bg-rose-900 dark:border-rose-800 dark:text-rose-100"
      ),
      golden: cn(
        "bg-golden-100 border-golden-200 text-golden-900",
        "dark:bg-golden-900 dark:border-golden-800 dark:text-golden-100"
      ),
      white: cn("border bg-background border-border", "text-primary-900"),
    },
  },
  defaultVariants: {
    size: "xs",
    color: "primary",
  },
});

const closeIconVariants: Record<ChipColorType, string> = {
  primary: cn(
    "text-primary-700 hover:text-primary-500 active:text-primary-950"
  ),
  highlight: cn(
    "text-highlight-900 hover:text-highlight-700 active:text-highlight-950"
  ),
  success: cn(
    "text-success-900 hover:text-success-700 active:text-success-950"
  ),
  warning: cn(
    "text-warning-900 hover:text-warning-700 active:text-warning-950"
  ),
  info: cn("text-info-900 hover:text-info-700 active:text-info-950"),
  green: cn(
    "text-green-900 hover:text-green-700 active:text-green-950",
    "dark:text-green-100 dark:hover:text-green-300 dark:active:text-green-50"
  ),
  blue: cn(
    "text-blue-900 hover:text-blue-700 active:text-blue-950",
    "dark:text-blue-100 dark:hover:text-blue-300 dark:active:text-blue-50"
  ),
  rose: cn(
    "text-rose-900 hover:text-rose-700 active:text-rose-950",
    "dark:text-rose-100 dark:hover:text-rose-300 dark:active:text-rose-50"
  ),
  golden: cn(
    "text-golden-900 hover:text-golden-700 active:text-golden-950",
    "dark:text-golden-100 dark:hover:text-golden-300 dark:active:text-golden-50"
  ),
  white: cn("text-primary-700 hover:text-primary-500 active:text-primary-950"),
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
        "transition-colors duration-200",
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
  color?: ChipColorType;
  label?: string;
  children?: ReactNode;
  className?: string;
  isBusy?: boolean;
  icon?: ComponentType;
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
