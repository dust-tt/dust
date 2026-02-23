import { cn } from "@sparkle/lib/utils";
import React from "react";

import { ListItem } from "./ListItem";

export type UniversalSearchItemProps = {
  visual?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  selected?: boolean;
  onClick?: () => void;
  className?: string;
  hasSeparator?: boolean;
};

export function UniversalSearchItem({
  visual,
  title,
  description,
  selected = false,
  onClick,
  className,
  hasSeparator = true,
}: UniversalSearchItemProps) {
  return (
    <ListItem
      onClick={onClick}
      className={cn(
        selected && "s-bg-highlight-50 dark:s-bg-highlight-50-night",
        className
      )}
      hasSeparator={hasSeparator}
    >
      <div className="s-flex s-min-w-0 s-flex-1 s-items-center s-gap-2">
        {visual}
        <div className="s-flex s-min-w-0 s-flex-1 s-flex-col s-text-foreground">
          <div className="s-heading-sm s-flex s-min-w-0 s-gap-1 s-truncate s-text-foreground dark:s-text-foreground-night">
            {title}
          </div>
          {description && (
            <div className="s-line-clamp-1 s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
              {description}
            </div>
          )}
        </div>
      </div>
    </ListItem>
  );
}
