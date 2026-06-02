import {
  getIcon,
  isCustomResourceIconType,
  isInternalAllowedIcon,
} from "@app/components/resources/resources_icons";
import {
  AttachmentChip,
  Chip,
  ExclamationCircleIcon,
  ToolsIcon,
} from "@dust-tt/sparkle";
import type React from "react";

function getToolIcon(toolIcon: string | null) {
  if (
    toolIcon &&
    (isCustomResourceIconType(toolIcon) || isInternalAllowedIcon(toolIcon))
  ) {
    return getIcon(toolIcon);
  }

  return ToolsIcon;
}

interface ToolChipProps {
  color?: React.ComponentProps<typeof AttachmentChip>["color"];
  onRemove?: () => void;
  title: string;
  toolIcon: string | null;
}

export function ToolChip({
  color = "white",
  onRemove,
  title,
  toolIcon,
}: ToolChipProps) {
  return (
    <Chip
      label={title}
      icon={getToolIcon(toolIcon)}
      color={color}
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
      icon={{ visual: ExclamationCircleIcon }}
      color="white"
      onRemove={onRemove}
      size="xs"
    />
  );
}
