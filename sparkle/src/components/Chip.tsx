import { cva } from "class-variance-authority";
import React, { ComponentType, ReactNode } from "react";

import {
  AnimatedText,
  LinkWrapper,
  LinkWrapperProps,
} from "@sparkle/components/";
import { XMarkIcon } from "@sparkle/icons/app";
import { cn } from "@sparkle/lib/utils";

import { Icon, IconProps } from "./Icon";

export const CHIP_SIZES = ["xs", "sm"] as const;

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
] as const;

type ChipColorType = (typeof CHIP_COLORS)[number];

const sizeVariants: Record<ChipSizeType, string> = {
  xs: "s-rounded-lg s-min-h-7 s-text-xs s-font-medium s-px-3 s-gap-1",
  sm: "s-rounded-xl s-min-h-9 s-text-sm s-font-medium s-px-3 s-gap-1.5",
};

const backgroundVariants: Record<ChipColorType, string> = {
  primary: cn(
    "s-bg-muted-background s-border-border",
    "dark:s-bg-muted-background-night dark:s-border-border-night"
  ),
  highlight: cn(
    "s-bg-highlight-100 s-border-highlight-200",
    "dark:s-bg-highlight-100-night dark:s-border-highlight-200-night"
  ),
  success: cn(
    "s-bg-success-100 s-border-success-200",
    "dark:s-bg-success-100-night dark:s-border-success-200-night"
  ),
  info: cn(
    "s-bg-info-100 s-border-info-200",
    "dark:s-bg-info-100-night dark:s-border-info-200-night"
  ),
  warning: cn(
    "s-bg-warning-100 s-border-warning-200",
    "dark:s-bg-warning-100-night dark:s-border-warning-200-night"
  ),
  green: cn(
    "s-bg-green-100 s-border-green-200",
    "dark:s-bg-green-100-night dark:s-border-green-200-night"
  ),
  blue: cn(
    "s-bg-sky-100 s-border-sky-200",
    "dark:s-bg-sky-100-night dark:s-border-sky-200-night"
  ),
  rose: cn(
    "s-bg-rose-100 s-border-rose-200",
    "dark:s-bg-rose-100-night dark:s-border-rose-200-night"
  ),
  golden: cn(
    "s-bg-golden-100 s-border-golden-200",
    "dark:s-bg-golden-100-night dark:s-border-golden-200-night"
  ),
};

const textVariants: Record<ChipColorType, string> = {
  primary: "s-text-primary-900 dark:s-text-primary-900-night",
  highlight: "s-text-highlight-900 dark:s-text-highlight-900-night",
  success: "s-text-success-900 dark:s-text-success-900-night",
  warning: "s-text-warning-900 dark:s-text-warning-900-night",
  info: "s-text-info-900 dark:s-text-info-900-night",
  green: "s-text-green-900 dark:s-text-green-900-night",
  blue: "s-text-sky-900 dark:s-text-sky-900-night",
  rose: "s-text-rose-900 dark:s-text-rose-900-night",
  golden: "s-text-golden-900 dark:s-text-golden-900-night",
};

const chipVariants = cva("s-inline-flex s-box-border s-items-center", {
  variants: {
    size: sizeVariants,
    text: textVariants,
    background: backgroundVariants,
  },
  defaultVariants: {
    size: "xs",
    text: "primary",
    background: "primary",
  },
});

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
  [K in keyof Omit<LinkWrapperProps, "children">]?: never;
};

type ChipLinkProps = ChipBaseProps &
  Omit<LinkWrapperProps, "children"> & {
    onClick?: never;
  };

type ChipProps = ChipLinkProps | ChipButtonProps;

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
          chipVariants({ size, background: color, text: color }),
          className,
          onRemove && "s-cursor-pointer"
        )}
        aria-label={label}
        ref={ref}
        onClick={onClick ? () => onClick() : undefined}
      >
        {children}
        {icon && <Icon visual={icon} size={size as IconProps["size"]} />}
        {label && (
          <span
            className={cn(
              "s-pointer s-grow s-truncate",
              onClick ? "s-cursor-pointer" : "s-cursor-default"
            )}
          >
            {isBusy ? (
              <AnimatedText variant={color}>{label}</AnimatedText>
            ) : (
              label
            )}
          </span>
        )}
        {onRemove && (
          <div onClick={onRemove ?? undefined}>
            <Icon
              visual={XMarkIcon}
              size={size}
              className="s-text-primary-700 hover:s-text-primary-500"
            />
          </div>
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
