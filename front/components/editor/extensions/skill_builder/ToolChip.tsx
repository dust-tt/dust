import {
  getIcon,
  isCustomResourceIconType,
  isInternalAllowedIcon,
} from "@app/components/resources/resources_icons";
import { AlertCircle, Chip, ShapesPlus } from "@dust-tt/sparkle";
import type React from "react";

function getToolIcon(toolIcon: string | null) {
  if (
    toolIcon &&
    (isCustomResourceIconType(toolIcon) || isInternalAllowedIcon(toolIcon))
  ) {
    return getIcon(toolIcon);
  }

  return ShapesPlus;
}

interface ToolChipProps {
  color?: React.ComponentProps<typeof Chip>["color"];
  onClick?: () => void;
  onRemove?: () => void;
  title: string;
  toolIcon: string | null;
}

export function ToolChip({
  color = "white",
  onClick,
  onRemove,
  title,
  toolIcon,
}: ToolChipProps) {
  return (
    <Chip
      label={title}
      icon={getToolIcon(toolIcon)}
      color={color}
      onClick={onClick}
      onRemove={onRemove}
      size="xs"
    />
  );
}

interface ToolErrorChipProps {
  onRemove?: () => void;
  title: string;
}

export function ToolErrorChip({ onRemove, title }: ToolErrorChipProps) {
  return (
    <Chip
      label={title}
      icon={AlertCircle}
      color="white"
      onRemove={onRemove}
      size="xs"
    />
  );
}
