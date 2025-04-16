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
  extends VariantProps<typeof positionVariants> {
  mainIcon: React.ComponentType;
  secondaryIcon: React.ComponentType;
  position?: "bottom-right" | "top-right" | "bottom-left" | "top-left";
  className?: string;
}

export const SimpleDoubleIcon = ({
  mainIcon,
  secondaryIcon,
  className,
}: SimpleDoubleIconProps) => {
  return (
    <div className={cn("s-relative s-h-8 s-w-8 s-p-0.5", className)}>
      <Icon
        className="s-text-foreground dark:s-text-foreground-night"
        size="md"
        visual={mainIcon}
      />
      <Icon
        size="xs"
        visual={secondaryIcon}
        className="s-absolute s-bottom-0 s-right-0"
      />
    </div>
  );
};
