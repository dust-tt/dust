import {
  getIcon,
  isCustomResourceIconType,
  isInternalAllowedIcon,
} from "@app/components/resources/resources_icons";
import {
  AlertCircleV2,
  AttachmentChip,
  Chip,
  ShapesPlusV2,
} from "@dust-tt/sparkle";
import type React from "react";

function getToolIcon(toolIcon: string | null) {
  if (
    toolIcon &&
    (isCustomResourceIconType(toolIcon) || isInternalAllowedIcon(toolIcon))
  ) {
    return getIcon(toolIcon);
  }

  return ShapesPlusV2;
}

interface ToolChipProps {
  color?: React.ComponentProps<typeof AttachmentChip>["color"];
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
    <AttachmentChip
      label={title}
      icon={{ visual: AlertCircleV2 }}
      color="white"
      onRemove={onRemove}
      size="xs"
    />
  );
}
