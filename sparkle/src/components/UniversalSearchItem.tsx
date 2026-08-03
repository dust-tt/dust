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
      className={cn(selected && "bg-highlight-50", className)}
      hasSeparator={hasSeparator}
    >
      <div className="flex min-w-0 flex-1 items-center gap-2">
        {visual}
        <div className="flex min-w-0 flex-1 flex-col text-foreground">
          <div className="heading-sm flex min-w-0 gap-1 truncate text-foreground">
            {title}
          </div>
          {description && (
            <div className="line-clamp-1 text-sm text-muted-foreground">
              {description}
            </div>
          )}
        </div>
      </div>
    </ListItem>
  );
}
