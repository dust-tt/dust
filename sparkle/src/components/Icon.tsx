import React, { ComponentType } from "react";

interface IconProps {
  IconComponent?: ComponentType<{ className?: string }>;
  className?: string;
}

export function Icon({ IconComponent, className = "" }: IconProps) {
  return IconComponent ? <IconComponent className={className} /> : null;
}
