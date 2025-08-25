import React from "react";

import { Avatar, Button, Card, Chip } from "@sparkle/components/";
import { PlusIcon } from "@sparkle/icons/app/";
import { cn } from "@sparkle/lib/utils";

const FADE_TRANSITION_CLASSES =
  "s-transition-opacity s-duration-300 s-ease-in-out";

export interface ToolCardProps {
  icon: React.ComponentType;
  label: string;
  description: string;
  isSelected: boolean;
  canAdd: boolean;
  cantAddReason?: string;
  onClick?: () => void;
  className?: string;
}

export const ToolCard = React.forwardRef<HTMLDivElement, ToolCardProps>(
  (
    {
      icon,
      label,
      description,
      isSelected,
      canAdd,
      cantAddReason,
      onClick,
      className,
    },
    ref
  ) => {
    return (
      <Card
        ref={ref}
        variant={isSelected ? "secondary" : "primary"}
        onClick={canAdd && !isSelected ? onClick : undefined}
        disabled={!canAdd || isSelected}
        className={cn("s-h-24 s-p-3", className)}
     >
        <div className="s-flex s-w-full s-flex-col">
          <div className="s-mb-2 s-flex s-items-start s-justify-between s-gap-2">
            <div className="s-flex s-items-center s-gap-2">
              <Avatar icon={icon} size="sm" />
              <span className="s-text-sm s-font-medium">{label}</span>
              {isSelected && (
                <Chip
                  size="xs"
                  color="green"
                  label="ADDED"
                  className={cn(FADE_TRANSITION_CLASSES, "s-opacity-100")}
                />
              )}
            </div>
            {canAdd && !isSelected && (
              <Button
                size="xs"
                variant="outline"
                icon={PlusIcon}
                label="Add"
                className={cn(FADE_TRANSITION_CLASSES, "s-flex-shrink-0")}
              />
            )}
            {!canAdd && cantAddReason && (
              <div className="s-flex-shrink-0 s-text-xs s-italic s-text-muted-foreground dark:s-text-muted-foreground-night">
                {cantAddReason}
              </div>
            )}
          </div>
          <div className="s-line-clamp-2 s-h-10 s-overflow-hidden s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night">
            {description}
          </div>
        </div>
      </Card>
    );
  }
);
ToolCard.displayName = "ToolCard";


