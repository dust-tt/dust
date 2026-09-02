import { DoubleIcon, Icon, InfoCircle } from "@dust-tt/sparkle";
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

// Standalone version of the badge above: the same filled `info` disc with the
// glyph knocked out in white (InfoCircle draws its ring just inside the icon
// box, so the disc is inset by a hair — mirrors DoubleIcon's filled badge).
export function DegradedInfoIcon() {
  return (
    <span className="relative flex h-5 w-5">
      <span className="absolute inset-px rounded-full bg-info-500" />
      <Icon visual={InfoCircle} size="sm" className="relative text-white" />
    </span>
  );
}
