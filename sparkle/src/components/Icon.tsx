import React, { ComponentType } from "react";
import { classNames } from "@sparkle/lib/utils";

interface IconProps {
  IconComponent?: ComponentType<{ className?: string }>;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

const IconSizes = {
  xs: "16",
  sm: "20",
  md: "24",
  lg: "32",
};

export function Icon({
  IconComponent,
  size = "md",
  className = "",
}: IconProps) {
  return IconComponent ? (
    <IconComponent
      className={classNames(className)}
      style={{ width: IconSizes[size] + "px", height: IconSizes[size] + "px" }}
    />
  ) : null;
}
