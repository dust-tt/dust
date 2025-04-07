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
