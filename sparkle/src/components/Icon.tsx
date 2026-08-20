import { cn } from "@sparkle/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";
import React, { type ComponentType } from "react";

export interface IconProps {
  /** The SVG icon component to render; nothing is rendered when omitted. */
  visual?: ComponentType<{ className?: string }>;
  size?: "xs" | "sm" | "md" | "lg" | "xl" | "2xl";
  /** Color is inherited from text color, so set it with a `text-*` class here. */
  className?: string;
}

const IconSizes = {
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

const iconSizeVariants = cva("absolute", {
  variants: {
    size: {
      sm: "bottom-0 right-0",
      md: "bottom-0 right-0",
      lg: "bottom-0 right-0",
      xl: "bottom-0 right-0",
    },
  },
  defaultVariants: {
    size: "lg",
  },
});

export interface DoubleIconProps extends VariantProps<typeof sizeVariants> {
  /** The primary icon, rendered at the full size. */
  mainIcon: React.ComponentType;
  /** The smaller badge icon, overlaid on the bottom-right corner. */
  secondaryIcon: React.ComponentType;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

/**
 * Renders a main icon with a smaller secondary icon overlaid on its
 * bottom-right corner, e.g. a tool icon badged with its provider logo. Use it
 * when a glyph needs a provider or status badge; for a plain glyph use Icon.
 *
 * @summary Icon with an overlaid badge icon.
 */
export const DoubleIcon = ({
  mainIcon,
  secondaryIcon,
  className,
  size = "lg",
}: DoubleIconProps) => {
  return (
    <div className={cn(sizeVariants({ size }), className)}>
      <Icon
        className="text-foreground"
        size={
          size === "sm"
            ? "xs"
            : size === "md"
              ? "sm"
              : size === "lg"
                ? "md"
                : "lg"
        }
        visual={mainIcon}
      />
      <Icon
        size={
          size === "sm"
            ? "xs"
            : size === "md"
              ? "xs"
              : size === "lg"
                ? "xs"
                : "md"
        }
        visual={secondaryIcon}
        className={cn("absolute", iconSizeVariants({ size }))}
      />
    </div>
  );
};
