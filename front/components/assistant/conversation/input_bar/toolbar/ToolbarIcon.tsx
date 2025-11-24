import { Icon, Tooltip } from "@dust-tt/sparkle";
import type { ComponentType } from "react";

import { cn } from "@app/components/poke/shadcn/lib/utils";

interface ToolbarIconProps {
  icon?: ComponentType<{ className?: string }>;
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
    <Tooltip
      trigger={
        <div
          className={cn(
            "cursor-pointer text-gray-500",
            active && "text-gray-950"
          )}
          onClick={(e) => {
            e.preventDefault(); // Prevents editor from losing focus
            e.stopPropagation(); // Prevents event from bubbling to InputBarContainer. Otherwise, focusEnd is triggered.
            onClick();
          }}
        >
          {icon && <Icon size="xs" visual={icon} />}
        </div>
      }
      label={tooltip}
    />
  );
}
