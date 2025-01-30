import { cva } from "class-variance-authority";
import React, { ComponentType, ReactNode } from "react";

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
] as const;
type ChipColorType = (typeof CHIP_COLORS)[number];

const sizeVariants: Record<ChipSizeType, string> = {
  xs: "s-rounded-lg s-min-h-7 s-text-xs s-font-medium s-px-2 [&>:not(:first-child)]:s-ml-1",
  sm: "s-rounded-xl s-min-h-9 s-text-sm s-font-medium s-px-3 [&>:not(:first-child)]:s-ml-2.5",
};

const backgroundVariants: Record<ChipColorType, string> = {
  emerald: "s-bg-emerald-100 s-border-emerald-200",
  amber: "s-bg-amber-100 s-border-amber-200",
  slate: "s-bg-slate-100 s-border-slate-200",
  purple: "s-bg-purple-100 s-border-purple-200",
  warning: "s-bg-warning-100 s-border-warning-200",
  sky: "s-bg-sky-100 s-border-sky-200",
  pink: "s-bg-pink-100 s-border-pink-200",
  red: "s-bg-red-100 s-border-red-200",
};

const textVariants: Record<ChipColorType, string> = {
  emerald: "s-text-emerald-900",
  amber: "s-text-amber-900",
  slate: "s-text-foreground",
  purple: "s-text-purple-900",
  warning: "s-text-warning-900",
  sky: "s-text-sky-900",
  pink: "s-text-pink-900",
  red: "s-text-red-900",
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

interface ChipProps {
  size?: ChipSizeType;
  color?: ChipColorType;
  label?: string;
  children?: ReactNode;
  className?: string;
  icon?: ComponentType;
  endIcon?: boolean | ComponentType;
}

const Chip = React.forwardRef<HTMLDivElement, ChipProps>(
  (
    {
      size = "xs",
      color = "slate",
      label,
      children,
      className,
      icon,
      endIcon,
    }: ChipProps,
    ref
  ) => (
    <div
      className={cn(
        chipVariants({ size, background: color, text: color }),
        className
      )}
      aria-label={label}
      ref={ref}
    >
      {children}
      {icon && <Icon visual={icon} size={size as IconProps["size"]} />}
      {label && (
        <span className="s-pointer s-grow s-cursor-default s-truncate">
          {label}
        </span>
      )}
      {endIcon && (
        <Icon
          visual={typeof endIcon === "boolean" ? XMarkIcon : endIcon}
          size={size as IconProps["size"]}
        />
      )}
    </div>
  )
);

Chip.displayName = "Chip";

export { Chip };
