import { cva, type VariantProps } from "class-variance-authority";
import React from "react";

import { cn } from "@sparkle/lib/utils";

import { Icon, IconProps } from "./Icon";

const positionVariants = cva("s-flex s-absolute", {
  variants: {
    position: {
      "bottom-right": "s-bottom-[-0.375rem] s-right-[-0.375rem]",
      "top-right": "s-top-[-0.375rem] s-right-[-0.375rem]",
      "bottom-left": "s-bottom-[-0.375rem] s-left-[-0.375rem]",
      "top-left": "s-top-[-0.375rem] s-left-[-0.375rem]",
    },
  },
  defaultVariants: {
    position: "bottom-right",
  },
});

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

export interface DoubleIconProps extends VariantProps<typeof positionVariants> {
  mainIconProps: IconProps;
  secondaryIconProps: IconProps;
  position?: "bottom-right" | "top-right" | "bottom-left" | "top-left";
  className?: string;
}

export const DoubleIcon = ({
  mainIconProps,
  secondaryIconProps,
  position = "bottom-right",
  className,
}: DoubleIconProps) => {
  return (
    <div className={cn("s-relative s-inline-flex", className)}>
      <Icon {...mainIconProps} />
      <div className={positionVariants({ position })}>
        <Icon {...secondaryIconProps} />
      </div>
    </div>
  );
};

export interface SimpleDoubleIconProps
  extends VariantProps<typeof sizeVariants> {
  mainIcon: React.ComponentType;
  secondaryIcon: React.ComponentType;
  size?: "md" | "lg" | "xl";
  className?: string;
}

export const SimpleDoubleIcon = ({
  mainIcon,
  secondaryIcon,
  className,
  size = "lg",
}: SimpleDoubleIconProps) => {
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
