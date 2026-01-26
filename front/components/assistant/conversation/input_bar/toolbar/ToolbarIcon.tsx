import { ToolbarIcon as SparkleToolbarIcon } from "@dust-tt/sparkle";
import type { ComponentType } from "react";

import { useKeyboardShortcutLabel } from "@app/hooks/useKeyboardShortcutLabel";
import { useIsMobile } from "@app/lib/swr/useIsMobile";

interface ToolbarIconProps {
  icon: ComponentType<{ className?: string }>;
  onClick: () => void;
  active?: boolean;
  tooltip: string;
  shortcut?: string;
}

/** @deprecated Use @dust-tt/sparkle ToolbarIcon. */
export function ToolbarIcon({
  icon,
  onClick,
  active,
  tooltip,
  shortcut,
}: ToolbarIconProps) {
  const isMobile = useIsMobile();
  const shortcutLabel = useKeyboardShortcutLabel(shortcut);
  const buttonSize = isMobile ? "xs" : "mini";

  let tooltipText = tooltip;
  if (isMobile) {
    tooltipText = "";
  } else if (shortcutLabel) {
    tooltipText = `${tooltip} (${shortcutLabel})`;
  }

  return (
    <SparkleToolbarIcon
      icon={icon}
      onClick={onClick}
      active={active}
      tooltip={tooltipText}
      size={buttonSize}
    />
  );
}
