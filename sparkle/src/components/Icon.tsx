import { cn } from "@sparkle/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import React, { type ComponentType } from "react";

export interface IconProps {
  visual?: ComponentType<{ className?: string }>;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  className?: string;
}

const IconSizes = {
  xs: "h-4 w-4",
  sm: "h-5 w-5",
  md: "h-6 w-6",
  lg: "h-8 w-8",
  xl: "h-12 w-12",
  "2xl": "h-20 w-20",
};

export function Icon({
  visual: IconComponent,
  size = "sm",
  className = "",
}: IconProps) {
  return IconComponent ? (
    <IconComponent className={cn(className, "shrink-0", IconSizes[size])} />
  ) : null;
}

const sizeVariants = cva("relative", {
  variants: {
    size: {
      sm: "h-5 w-5",
      md: "h-6 w-6",
      lg: "h-8 w-8 p-0.5",
      xl: "h-10 w-10",
    },
  },
  defaultVariants: {
    size: "lg",
  },
});

const iconSizeVariants = cva("absolute", {
  variants: {
    size: {
      sm: "bottom-0 right-0",
      md: "bottom-0 right-0",
      lg: "bottom-0 right-0",
      xl: "bottom-0 right-0",
    },
  },
  defaultVariants: {
    size: "lg",
  },
});

export interface DoubleIconProps extends VariantProps<typeof sizeVariants> {
  mainIcon: React.ComponentType;
  secondaryIcon: React.ComponentType;
  size?: "sm" | "md" | "lg" | "xl";
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
        className="text-foreground"
        size={
          size === "sm"
            ? "xs"
            : size === "md"
              ? "sm"
              : size === "lg"
                ? "md"
                : "lg"
        }
        visual={mainIcon}
      />
      <Icon
        size={
          size === "sm"
            ? "xs"
            : size === "md"
              ? "xs"
              : size === "lg"
                ? "xs"
                : "md"
        }
        visual={secondaryIcon}
        className={cn("absolute", iconSizeVariants({ size }))}
      />
    </div>
  );
};
