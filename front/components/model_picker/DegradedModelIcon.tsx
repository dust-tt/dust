import { DoubleIcon, InfoCircle } from "@dust-tt/sparkle";
import type { ComponentType } from "react";

interface DegradedModelIconProps {
  icon: ComponentType;
}

export function DegradedModelIcon({ icon }: DegradedModelIconProps) {
  return (
    <DoubleIcon
      size="xs"
      mainIcon={icon}
      secondaryIcon={InfoCircle}
      position="top-right"
      secondaryColor="info"
    />
  );
}
