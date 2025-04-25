import { cva, VariantProps } from "class-variance-authority";
import React, { ComponentType } from "react";

import { cn } from "@sparkle/lib/utils";

export interface IconProps {
  visual?: ComponentType<{ className?: string }>;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
}

const IconSizes = {
  xs: "s-h-4 s-w-4",
  sm: "s-h-5 s-w-5",
  md: "s-h-6 s-w-6",
  lg: "s-h-8 s-w-8",
  xl: "s-h-12 s-w-12",
  "2xl": "s-h-20 s-w-20",
};

export function Icon({
  visual: IconComponent,
  size = "sm",
  className = "",
}: IconProps) {
  return IconComponent ? (
    <IconComponent className={cn(className, "s-shrink-0", IconSizes[size])} />
  ) : null;
}

const sizeVariants = cva("s-relative", {
  variants: {
    size: {
      md: "s-h-6 s-w-6",
      lg: "s-h-8 s-w-8 s-p-0.5",
      xl: "s-h-10 s-w-10",
    },
  },
  defaultVariants: {
    size: "lg",
  },
});

const iconSizeVariants = cva("s-absolute", {
  variants: {
    size: {
      md: "s-bottom-0 s-right-0",
      lg: "s-bottom-0 s-right-0",
      xl: "s-bottom-0 s-right-0",
    },
  },
  defaultVariants: {
    size: "lg",
  },
});

export interface DoubleIconProps extends VariantProps<typeof sizeVariants> {
  mainIcon: React.ComponentType;
  secondaryIcon: React.ComponentType;
  size?: "md" | "lg" | "xl";
  className?: string;
}

export const DoubleIcon = ({
  mainIcon,
  secondaryIcon,
  className,
  size = "lg",
}: DoubleIconProps) => {
  return (
    <div className={cn(sizeVariants({ size }), className)}>
      <Icon
        className="s-text-foreground dark:s-text-foreground-night"
        size={size === "md" ? "sm" : size === "lg" ? "md" : "lg"}
        visual={mainIcon}
      />
      <Icon
        size={size === "md" ? "xs" : size === "lg" ? "xs" : "md"}
        visual={secondaryIcon}
        className={cn("s-absolute", iconSizeVariants({ size }))}
      />
    </div>
  );
};
