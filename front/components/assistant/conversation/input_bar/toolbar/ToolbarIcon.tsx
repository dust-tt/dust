import { Button } from "@dust-tt/sparkle";
import type { ComponentType } from "react";

import { useIsMobile } from "@app/lib/swr/useIsMobile";
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
  const isMobile = useIsMobile();
  const buttonSize = isMobile ? "xs" : "mini";
  return (
    <Button
      tooltip={tooltip}
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
