import React, { ComponentType, MouseEventHandler } from "react";

import { Button } from "@sparkle/components/Button";

import { Tooltip } from "./Tooltip";

type IconButtonProps = {
  variant?: React.ComponentProps<typeof Button>["variant"];
  onClick?: MouseEventHandler<HTMLButtonElement>;
  size?: React.ComponentProps<typeof Button>["size"];
  tooltip?: string;
  tooltipPosition?: React.ComponentProps<typeof Tooltip>["side"];
  icon?: ComponentType;
  className?: string;
  disabled?: boolean;
};

export function IconButton({
  variant,
  onClick,
  disabled = false,
  tooltip,
  tooltipPosition,
  icon,
  className,
  size,
}: IconButtonProps) {
  const IconButtonContent = (
    <Button
      variant={variant}
      onClick={onClick}
      disabled={disabled}
      icon={icon}
      size={size}
      className={className}
    />
  );

  return tooltip ? (
    <Tooltip
      trigger={IconButtonContent}
      label={tooltip}
      side={tooltipPosition}
      tooltipTriggerAsChild
    />
  ) : (
    IconButtonContent
  );
}
