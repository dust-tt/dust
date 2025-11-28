import { Button } from "@dust-tt/sparkle";
import type { ComponentType } from "react";
interface ToolbarIconProps {
  icon: ComponentType<{ className?: string }>;
  onClick: () => void;
  active?: boolean;
  tooltip: string;
}

export function ToolbarIcon({
  icon,
  onClick,
  active,
  tooltip,
}: ToolbarIconProps) {
  return (
    <Button
      tooltip={tooltip}
      icon={icon}
      onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault(); // Prevents editor from losing focus
        e.stopPropagation(); // Prevents event from bubbling to InputBarContainer. Otherwise, focusEnd is triggered.
        onClick();
      }}
      size="mini"
      variant={active ? "ghost" : "ghost-secondary"}
    />
  );
}
