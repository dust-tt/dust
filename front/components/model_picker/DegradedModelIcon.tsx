import type { DoubleIconProps } from "@dust-tt/sparkle";
import { DoubleIcon, Icon, InfoCircle } from "@dust-tt/sparkle";
import type { ComponentType } from "react";

// Surfaces the degradation badge is rendered on. Its glyph — and the halo the
// glyph draws around itself — is knocked out in the surface color, so the badge
// reads as punched out of that surface in both themes.
type DegradationSurface = "composer" | "menu";

const SURFACE_KNOCKOUT: Record<
  DegradationSurface,
  Pick<DoubleIconProps, "surface" | "className">
> = {
  // The input bar paints its own background instead of a surface token.
  composer: { surface: "current", className: "text-input-bar-background" },
  menu: { surface: "overlay-background" },
};

interface DegradedModelIconProps {
  icon: ComponentType;
  surface: DegradationSurface;
}

export function DegradedModelIcon({ icon, surface }: DegradedModelIconProps) {
  return (
    <DoubleIcon
      size="xs"
      mainIcon={icon}
      secondaryIcon={InfoCircle}
      // The badge carries the whole degradation signal on a 16px trigger, so it
      // stays close to the provider icon's size rather than scaling down.
      position="top-right"
      secondaryColor="info"
      secondarySize="badge"
      {...SURFACE_KNOCKOUT[surface]}
    />
  );
}

// The row-level counterpart, always inside the picker menu. Nothing sits behind
// it, so knocking the glyph out in the menu background drops the halo and
// leaves a plain filled disc.
export function DegradedInfoIcon() {
  return (
    <span className="relative flex h-5 w-5">
      <span className="absolute inset-px rounded-full bg-info-500" />
      <Icon
        visual={InfoCircle}
        size="sm"
        className="relative text-overlay-background"
      />
    </span>
  );
}
