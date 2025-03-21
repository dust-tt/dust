import { cva } from "class-variance-authority";
import React, { ComponentType, ReactNode } from "react";

import {
  AnimatedText,
  IconButton,
  LinkWrapper,
  LinkWrapperProps,
} from "@sparkle/components/";
import { XMarkIcon } from "@sparkle/icons";
import { cn } from "@sparkle/lib/utils";

import { Icon, IconProps } from "./Icon";

export const CHIP_SIZES = ["xs", "sm"] as const;

type ChipSizeType = (typeof CHIP_SIZES)[number];

export const CHIP_COLORS = [
  "emerald",
  "amber",
  "slate",
  "purple",
  "warning",
  "sky",
  "pink",
  "red",
  "white",
] as const;

type ChipColorType = (typeof CHIP_COLORS)[number];

const sizeVariants: Record<ChipSizeType, string> = {
  xs: "s-rounded-lg s-min-h-7 s-text-xs s-font-medium s-px-3 s-gap-1",
  sm: "s-rounded-xl s-min-h-9 s-text-sm s-font-medium s-px-3 s-gap-1.5",
};

const backgroundVariants: Record<ChipColorType, string> = {
  emerald: cn(
    "s-bg-emerald-100 s-border-emerald-200",
    "dark:s-bg-emerald-100-night dark:s-border-emerald-200-night"
  ),
  amber: cn(
    "s-bg-amber-100 s-border-amber-200",
    "dark:s-bg-amber-100-night dark:s-border-amber-200-night"
  ),
  slate: cn(
    "s-bg-muted-background s-border-border",
    "dark:s-bg-muted-background-night dark:s-border-border-night"
  ),
  purple: cn(
    "s-bg-purple-100 s-border-purple-200",
    "dark:s-bg-purple-100-night dark:s-border-purple-200-night"
  ),
  white: cn(
    "s-bg-background s-border-border",
    "dark:s-bg-muted-background-night dark:s-border-border-night"
  ),
  warning: cn(
    "s-bg-warning-100 s-border-warning-200",
    "dark:s-bg-warning-100-night dark:s-border-warning-200-night"
  ),
  sky: cn(
    "s-bg-sky-100 s-border-sky-200",
    "dark:s-bg-sky-100-night dark:s-border-sky-200-night"
  ),
  pink: cn(
    "s-bg-pink-100 s-border-pink-200",
    "dark:s-bg-pink-100-night dark:s-border-pink-200-night"
  ),
  red: cn(
    "s-bg-red-100 s-border-red-200",
    "dark:s-bg-red-100-night dark:s-border-red-200-night"
  ),
};

const textVariants: Record<ChipColorType, string> = {
  emerald: "s-text-emerald-900 dark:s-text-emerald-900-night",
  amber: "s-text-amber-900 dark:s-text-amber-900-night",
  slate: "s-text-foreground dark:s-text-foreground-night",
  purple: "s-text-purple-900 dark:s-text-purple-900-night",
  warning: "s-text-warning-900 dark:s-text-warning-900-night",
  sky: "s-text-sky-900 dark:s-text-sky-900-night",
  pink: "s-text-pink-900 dark:s-text-pink-900-night",
  red: "s-text-red-900 dark:s-text-red-900-night",
  white: "s-text-foreground dark:s-text-foreground-night",
};

const chipVariants = cva("s-inline-flex s-box-border s-items-center", {
  variants: {
    size: sizeVariants,
    text: textVariants,
    background: backgroundVariants,
  },
  defaultVariants: {
    size: "xs",
    text: "slate",
    background: "slate",
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
          <IconButton
            variant="outline"
            icon={XMarkIcon}
            size={size}
            onClick={onRemove ?? undefined}
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
