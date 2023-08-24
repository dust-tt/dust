import React, { ComponentType } from "react";
import { classNames } from "@sparkle/lib/utils";

export interface IconProps {
  IconComponent?: ComponentType<{ className?: string }>;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}

const IconSizes = {
  xs: "s-h-4 s-w-4",
  sm: "s-h-5 s-w-5",
  md: "s-h-6 s-w-6",
  lg: "s-h-8 s-w-8",
};

export function Icon({
  IconComponent,
  size = "sm",
  className = "",
}: IconProps) {
  return IconComponent ? (
    <IconComponent className={(classNames(className), IconSizes[size])} />
  ) : null;
}
