import { cva, type VariantProps } from "class-variance-authority";
import React from "react";

import { cn } from "@sparkle/lib/utils";

import { Icon, IconProps } from "./Icon";

const positionVariants = cva("s-flex", {
  variants: {
    position: {
      "bottom-right": "-s-ml-1.5 s-mt-1.5",
      "top-right": "-s-ml-1.5 -s-mt-1.5",
      "bottom-left": "s-ml-1.5 s-mt-1.5",
      "top-left": "s-ml-1.5 -s-mt-1.5",
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
