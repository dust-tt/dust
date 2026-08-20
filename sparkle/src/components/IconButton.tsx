import { BUTTON_VARIANTS, Button } from "@sparkle/components/Button";
import type { Tooltip } from "@sparkle/components/Tooltip";
import { cn } from "@sparkle/lib/utils";
import { cva } from "class-variance-authority";
import React, { type ComponentType, type MouseEventHandler } from "react";

export const ICON_BUTTON_VARIANTS = BUTTON_VARIANTS;
export type IconButtonVariantType = (typeof ICON_BUTTON_VARIANTS)[number];

const iconButtonVariants = cva(
  "transition-all ease-out duration-300 cursor-pointer hover:scale-110",
  {
    variants: {
      variant: {
        primary: cn(
          "text-highlight-500",
          "hover:text-highlight-400",
          "active:text-highlight-dark",
          "text-muted-foreground"
        ),
        warning: cn(
          "text-warning-500",
          "hover:text-warning-400",
          "active:text-warning-600",
          "text-muted-foreground"
        ),
        "warning-secondary": cn(
          "text-warning-500",
          "hover:text-warning-400",
          "active:text-warning-600",
          "text-muted-foreground"
        ),
        highlight: cn(
          "text-foreground",
          "hover:text-highlight-400",
          "active:text-highlight-dark",
          "text-muted-foreground"
        ),
        "highlight-secondary": cn(
          "text-foreground",
          "hover:text-highlight-400",
          "active:text-highlight-dark",
          "text-muted-foreground"
        ),
        outline: cn(
          "text-primary-700",
          "hover:text-faint",
          "active:text-highlight-dark",
          "text-muted-foreground"
        ),
        ghost: cn(
          "text-background",
          "hover:text-primary-100",
          "active:text-primary-200",
          "text-background/50"
        ),
        "ghost-secondary": cn(
          "text-white",
          "hover:text-primary-100",
          "active:text-primary-200",
          "text-background/50"
        ),
        "highlight-ghost": cn(
          "text-highlight-500",
          "hover:text-highlight-400",
          "active:text-highlight-dark",
          "text-muted-foreground"
        ),
        "warning-ghost": cn(
          "text-warning-500",
          "hover:text-warning-400",
          "active:text-warning-600",
          "text-muted-foreground"
        ),
      },
    },
    defaultVariants: {
      variant: "outline",
    },
  }
);

export interface IconButtonProps
  extends Omit<
    React.ComponentPropsWithoutRef<typeof Button>,
    "label" | "variant"
  > {
  /** Visual style of the icon (color scheme for rest/hover/active states). */
  variant?: IconButtonVariantType;
  /** Invoked when the button is clicked. */
  onClick?: MouseEventHandler<HTMLButtonElement>;
  /** Tooltip shown on hover; strongly recommended since the button has no label. */
  tooltip?: string;
  /** Which side of the button the tooltip appears on. */
  tooltipPosition?: React.ComponentProps<typeof Tooltip>["side"];
  /** The icon component to render. */
  icon: ComponentType;
}

/**
 * A compact, label-less button rendered as a single icon, available in several
 * visual variants and sizes with an optional tooltip to convey its meaning.
 * Use it for dense toolbars or inline controls with self-explanatory actions
 * (settings, close, edit); for a call-to-action that benefits from a label,
 * prefer Button.
 *
 * @summary Compact icon-only button.
 */
const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      variant = "outline",
      onClick,
      disabled = false,
      tooltip,
      icon,
      className,
      size = "sm",
      ...props
    },
    ref
  ) => (
    <Button
      tooltip={tooltip}
      className={cn(
        iconButtonVariants({ variant }),
        disabled && cn("text-primary-500", "cursor-default hover:scale-100"),
        className
      )}
      onClick={onClick}
      disabled={disabled}
      ref={ref}
      size={size}
      icon={icon}
      variant="ghost"
      {...props}
    />
  )
);

IconButton.displayName = "IconButton";

export { IconButton, iconButtonVariants };
