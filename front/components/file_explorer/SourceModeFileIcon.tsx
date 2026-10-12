import { Icon } from "@dust-tt/sparkle";
import type { ComponentType } from "react";

interface SourceModeFileIconProps {
  visual: ComponentType;
  className?: string;
  onToggleSourceMode: () => void;
}

/** A file's icon that hides the switch to its Markdown source: Option/Alt-click toggles it. */
export function SourceModeFileIcon({
  visual,
  className,
  onToggleSourceMode,
}: SourceModeFileIconProps) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden
      className="flex shrink-0 cursor-default"
      onClick={(event) => {
        if (event.altKey) {
          onToggleSourceMode();
        }
      }}
    >
      <Icon visual={visual} size="sm" className={className} />
    </button>
  );
}
