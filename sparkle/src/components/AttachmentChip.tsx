import React from "react";

import { cn } from "@sparkle/lib/utils";

import { Icon } from "./Icon";

interface AttachmentChipProps {
  label: string;
  icon: React.ComponentType;
  className?: string;
}

export function AttachmentChip({
  label,
  icon,
  className,
}: AttachmentChipProps) {
  return (
    <div
      className={cn(
        "s-box-border s-inline-flex s-items-center s-gap-1.5 s-rounded-lg s-px-2 s-py-1 s-text-sm s-font-semibold",
        "s-border-border s-bg-background",
        "dark:s-border-border-night dark:s-bg-background-night",
        "s-text-foreground dark:s-text-foreground-night",
        "s-max-w-[180px]",
        className
      )}
    >
      <Icon visual={icon} size="xs" className="s-shrink-0" />
      <span className="s-pointer s-grow s-truncate">{label}</span>
    </div>
  );
}
