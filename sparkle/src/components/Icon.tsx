import { cn } from "@sparkle/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import React, { type ComponentType } from "react";

export interface IconProps {
  /** The SVG icon component to render; nothing is rendered when omitted. */
  visual?: ComponentType<{ className?: string }>;
  size?: "2xs" | "badge" | "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  /** Color is inherited from text color, so set it with a `text-*` class here. */
  className?: string;
}

const IconSizes = {
  // Badge scale: too small for a standalone glyph, use it inside DoubleIcon.
  // `badge` (14px) sits between the two steps, for a status disc that has to
  // read on a 16px main icon without matching it.
  "2xs": "h-3 w-3",
  badge: "h-3.5 w-3.5",
  xs: "h-4 w-4",
  sm: "h-5 w-5",
  md: "h-6 w-6",
  lg: "h-8 w-8",
  xl: "h-12 w-12",
  "2xl": "h-20 w-20",
};

/**
 * Renders an SVG icon component passed via `visual` at a consistent size.
 * Color is inherited from text color, so apply a `text-*` class via
 * `className`. Use it to display a standalone glyph inside labels, buttons,
 * list items, or status indicators; for clickable icons prefer IconButton or
 * Button with an `icon`, and for an icon overlaid with a badge use DoubleIcon.
 *
 * @summary Sized standalone SVG glyph.
 */
export function Icon({
  visual: IconComponent,
  size = "sm",
  className = "",
}: IconProps) {
  return IconComponent ? (
    <IconComponent className={cn(className, "shrink-0", IconSizes[size])} />
  ) : null;
}

const sizeVariants = cva("relative", {
  variants: {
    size: {
      xs: "h-4 w-4",
      sm: "h-5 w-5",
      md: "h-6 w-6",
      lg: "h-8 w-8 p-0.5",
      xl: "h-10 w-10",
    },
  },
  defaultVariants: {
    size: "lg",
  },
});

const positionVariants = cva("absolute", {
  variants: {
    position: {
      "bottom-right": "bottom-0 right-0",
      "top-right": "right-0 top-0 -translate-y-1/4 translate-x-1/4",
    },
  },
  defaultVariants: {
    position: "bottom-right",
  },
});

// Inset by a hair because the status glyphs (InfoCircle, AlertCircle,
// CheckCircle...) draw their own ring just inside the icon box.
const fillVariants = cva("absolute inset-px rounded-full", {
  variants: {
    color: {
      info: "bg-info-500",
      warning: "bg-warning-500",
      success: "bg-success-500",
      highlight: "bg-highlight-500",
    },
  },
});

// A filled badge knocks its glyph out in the color of the surface behind the
// icon: the status glyphs draw their own ring, which then reads as a halo
// separating the badge from the main icon. Plain white only works on a light
// surface, hence a token per surface.
const knockoutVariants = cva("relative", {
  variants: {
    surface: {
      background: "text-background",
      "app-background": "text-app-background",
      "panel-background": "text-panel-background",
      "overlay-background": "text-overlay-background",
      "modal-background": "text-modal-background",
      "muted-background": "text-muted-background",
      // For surfaces that paint their own color instead of a token: the caller
      // sets that color as a `text-*` class on the DoubleIcon itself.
      current: "text-current",
    },
  },
  defaultVariants: {
    surface: "background",
  },
});

type DoubleIconSize = "xs" | "sm" | "md" | "lg" | "xl";

type DoubleIconSurface = NonNullable<
  VariantProps<typeof knockoutVariants>["surface"]
>;

const MAIN_ICON_SIZE: Record<DoubleIconSize, IconProps["size"]> = {
  xs: "xs",
  sm: "xs",
  md: "sm",
  lg: "md",
  xl: "lg",
};

const SECONDARY_ICON_SIZE: Record<DoubleIconSize, IconProps["size"]> = {
  xs: "2xs",
  sm: "xs",
  md: "xs",
  lg: "xs",
  xl: "sm",
};

export interface DoubleIconProps
  extends VariantProps<typeof sizeVariants>,
    VariantProps<typeof positionVariants>,
    VariantProps<typeof knockoutVariants> {
  /** The primary icon, rendered at the full size. */
  mainIcon: React.ComponentType;
  /** The smaller badge icon, overlaid on a corner of the main icon. */
  secondaryIcon: React.ComponentType;
  size?: DoubleIconSize;
  /** Corner the badge sits in; defaults to the bottom-right. */
  position?: "bottom-right" | "top-right";
  /** Fills the badge with a semantic color and knocks the glyph out. */
  secondaryColor?: "info" | "warning" | "success" | "highlight";
  /** Badge size, when the badge needs more presence than `size` gives it. */
  secondarySize?: IconProps["size"];
  /** Surface behind the icon; a filled badge is knocked out in its color so it
   * reads the same in both themes. Defaults to the page background; pass
   * `current` to knock it out in this icon's own text color instead. */
  surface?: DoubleIconSurface;
  className?: string;
}

/**
 * Renders a main icon with a smaller secondary icon overlaid on one of its
 * corners, e.g. a tool icon badged with its provider logo, or a model icon
 * badged with an `info` status. Pass `secondaryColor` to turn the badge into a
 * filled status disc, along with the `surface` it sits on so its glyph is
 * knocked out in that surface's color. For a plain glyph use Icon.
 *
 * @summary Icon with an overlaid badge icon.
 */
export const DoubleIcon = ({
  mainIcon,
  secondaryIcon,
  className,
  size = "lg",
  position = "bottom-right",
  secondaryColor,
  secondarySize,
  surface = "background",
}: DoubleIconProps) => {
  const badgeSize = secondarySize ?? SECONDARY_ICON_SIZE[size];

  return (
    <div className={cn(sizeVariants({ size }), className)}>
      <Icon
        className="text-foreground"
        size={MAIN_ICON_SIZE[size]}
        visual={mainIcon}
      />
      {secondaryColor ? (
        <span className={cn(positionVariants({ position }), "flex")}>
          <span className={fillVariants({ color: secondaryColor })} />
          <Icon
            size={badgeSize}
            visual={secondaryIcon}
            className={knockoutVariants({ surface })}
          />
        </span>
      ) : (
        <Icon
          size={badgeSize}
          visual={secondaryIcon}
          className={positionVariants({ position })}
        />
      )}
    </div>
  );
};
