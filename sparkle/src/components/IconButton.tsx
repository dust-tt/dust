import {
  Button,
  type ButtonProps,
  type ButtonSizeType,
  type ButtonVariantType,
} from "@sparkle/components/Button";
import type { Tooltip } from "@sparkle/components/Tooltip";
import React, { type ComponentType, type MouseEventHandler } from "react";

// IconButton is a thin convenience wrapper around the (new) ghost Button,
// rendered icon-only. Its legacy `variant` only ever set the icon color, so it
// maps onto the new ghost button family; legacy sizes map onto the new S/M/L
// scale. The old hover:scale zoom is dropped in favor of the new ghost hover.

export const ICON_BUTTON_VARIANTS = [
  "primary",
  "highlight",
  "highlight-secondary",
  "warning",
  "warning-secondary",
  "outline",
  "ghost",
  "ghost-secondary",
] as const;
export type IconButtonVariantType = (typeof ICON_BUTTON_VARIANTS)[number];

const VARIANT_MAP: Record<IconButtonVariantType, ButtonVariantType> = {
  primary: "ghost",
  outline: "ghost",
  ghost: "ghost",
  "ghost-secondary": "ghost-secondary",
  highlight: "highlight-ghost",
  "highlight-secondary": "highlight-ghost",
  warning: "warning-ghost",
  "warning-secondary": "warning-ghost",
};

type LegacyIconButtonSize =
  | "xmini"
  | "mini"
  | "xs"
  | "sm"
  | "md"
  | "icon-xs"
  | "icon"
  | "icon-sm";

const SIZE_MAP: Record<LegacyIconButtonSize, ButtonSizeType> = {
  xmini: "xs",
  mini: "xs",
  "icon-xs": "xs",
  xs: "xs",
  icon: "xs",
  sm: "sm",
  "icon-sm": "sm",
  md: "md",
};

export interface IconButtonProps
  extends Omit<ButtonProps, "label" | "variant" | "size" | "icon"> {
  variant?: IconButtonVariantType;
  size?: LegacyIconButtonSize;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  tooltip?: string;
  // Accepted for backwards compatibility; the new Button tooltip has no side
  // option, so this is not forwarded (matching the previous behavior).
  tooltipPosition?: React.ComponentProps<typeof Tooltip>["side"];
  icon: ComponentType;
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      variant = "outline",
      size = "sm",
      disabled = false,
      tooltipPosition: _tooltipPosition,
      icon,
      ...props
    },
    ref
  ) => (
    <Button
      ref={ref}
      variant={VARIANT_MAP[variant]}
      size={SIZE_MAP[size]}
      icon={icon}
      disabled={disabled}
      {...props}
    />
  )
);

IconButton.displayName = "IconButton";

export { IconButton };
