import { Button } from "@dust-tt/sparkle";
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
    tooltipText = ""; // No tooltips on mobile
  } else if (shortcutLabel) {
    tooltipText = `${tooltip} (${shortcutLabel})`;
  }

  return (
    <Button
      tooltip={tooltipText}
      icon={icon}
      onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault(); // Prevents editor from losing focus
        e.stopPropagation(); // Prevents event from bubbling to InputBarContainer. Otherwise, focusEnd is triggered.
        onClick();
      }}
      size={buttonSize}
      variant={active ? "ghost" : "ghost-secondary"}
    />
  );
}
