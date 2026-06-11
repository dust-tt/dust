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

const chipVariants = cva("s:inline-flex s:box-border s:items-center", {
  variants: {
    size: {
      mini: "s:rounded-md s:min-h-5 s:text-xs s:font-medium s:px-1.5 s:py-1 s:gap-0.5",
      xs: "s:rounded-lg s:min-h-7 s:heading-xs s:px-3 s:gap-1",
      sm: "s:rounded-xl s:min-h-9 s:heading-sm s:px-4 s:gap-1.5",
    },
    color: {
      primary: cn(
        "s:bg-muted-background s:border-border",
        "s:text-primary-900",
        "s:dark:bg-muted-background-night s:dark:border-border-night",
        "s:dark:text-primary-900-night"
      ),
      highlight: cn(
        "s:bg-highlight-100 s:border-highlight-200",
        "s:text-highlight-900",
        "s:dark:bg-highlight-100-night s:dark:border-highlight-200-night",
        "s:dark:text-highlight-900-night"
      ),
      success: cn(
        "s:bg-success-100 s:border-success-200",
        "s:text-success-900",
        "s:dark:bg-success-100-night s:dark:border-success-200-night",
        "s:dark:text-success-900-night"
      ),
      info: cn(
        "s:bg-info-100 s:border-info-200",
        "s:text-info-900",
        "s:dark:bg-info-100-night s:dark:border-info-200-night",
        "s:dark:text-info-900-night"
      ),
      warning: cn(
        "s:bg-warning-100 s:border-warning-200",
        "s:text-warning-900",
        "s:dark:bg-warning-100-night s:dark:border-warning-200-night",
        "s:dark:text-warning-900-night"
      ),
      green: cn(
        "s:bg-green-100 s:border-green-200",
        "s:text-green-900",
        "s:dark:bg-green-100-night s:dark:border-green-200-night",
        "s:dark:text-green-900-night"
      ),
      blue: cn(
        "s:bg-blue-100 s:border-blue-200",
        "s:text-blue-900",
        "s:dark:bg-blue-100-night s:dark:border-blue-200-night",
        "s:dark:text-blue-900-night"
      ),
      rose: cn(
        "s:bg-rose-100 s:border-rose-200",
        "s:text-rose-900",
        "s:dark:bg-rose-100-night s:dark:border-rose-200-night",
        "s:dark:text-rose-900-night"
      ),
      golden: cn(
        "s:bg-golden-100 s:border-golden-200",
        "s:text-golden-900",
        "s:dark:bg-golden-100-night s:dark:border-golden-200-night",
        "s:dark:text-golden-900-night"
      ),
      white: cn(
        "s:border s:bg-white s:border-border",
        "s:text-primary-900",
        "s:dark:bg-background-night s:dark:border-border-night",
        "s:dark:text-primary-900-night"
      ),
    },
  },
  defaultVariants: {
    size: "xs",
    color: "primary",
  },
});

const closeIconVariants: Record<ChipColorType, string> = {
  primary: cn(
    "s:text-primary-700 s:hover:text-primary-500 s:active:text-primary-950",
    "s:dark:text-primary-700-night s:dark:hover:text-primary-500-night s:dark:active:text-primary-950-night"
  ),
  highlight: cn(
    "s:text-highlight-900 s:hover:text-highlight-700 s:active:text-highlight-950",
    "s:dark:text-highlight-900-night s:dark:hover:text-highlight-700-night s:dark:active:text-highlight-950-night"
  ),
  success: cn(
    "s:text-success-900 s:hover:text-success-700 s:active:text-success-950",
    "s:dark:text-success-900-night s:dark:hover:text-success-700-night s:dark:active:text-success-950-night"
  ),
  warning: cn(
    "s:text-warning-900 s:hover:text-warning-700 s:active:text-warning-950",
    "s:dark:text-warning-900-night s:dark:hover:text-warning-700-night s:dark:active:text-warning-950-night"
  ),
  info: cn(
    "s:text-info-900 s:hover:text-info-700 s:active:text-info-950",
    "s:dark:text-info-900-night s:dark:hover:text-info-700-night s:dark:active:text-info-950-night"
  ),
  green: cn(
    "s:text-green-900 s:hover:text-green-700 s:active:text-green-950",
    "s:dark:text-green-900-night s:dark:hover:text-green-700-night s:dark:active:text-green-950-night"
  ),
  blue: cn(
    "s:text-blue-900 s:hover:text-blue-700 s:active:text-blue-950",
    "s:dark:text-blue-900-night s:dark:hover:text-blue-700-night s:dark:active:text-blue-950-night"
  ),
  rose: cn(
    "s:text-rose-900 s:hover:text-rose-700 s:active:text-rose-950",
    "s:dark:text-rose-900-night s:dark:hover:text-rose-700-night s:dark:active:text-rose-950-night"
  ),
  golden: cn(
    "s:text-golden-900 s:hover:text-golden-700 s:active:text-golden-950",
    "s:dark:text-golden-900-night s:dark:hover:text-golden-700-night s:dark:active:text-golden-950-night"
  ),
  white: cn(
    "s:text-primary-700 s:hover:text-primary-500 s:active:text-primary-950",
    "s:dark:text-primary-700-night s:dark:hover:text-primary-500-night s:dark:active:text-primary-950-night"
  ),
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
        "s:rounded-md s:p-0.5",
        "s:transition-colors s:duration-200",
        "s:focus-visible:outline-hidden s:focus-visible:ring-2 s:focus-visible:ring-ring",
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
          onClick && "s:cursor-pointer"
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
          <span
            className={cn("s:grow s:truncate", onClick && "s:cursor-pointer")}
          >
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
            className={cn("s:-mr-1", closeIconVariants[color || "primary"])}
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
