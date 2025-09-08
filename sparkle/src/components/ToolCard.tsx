import React from "react";

import { Avatar, Button, Card, Chip } from "@sparkle/components/";
import { TruncatedText } from "@sparkle/components/TruncatedText";
import { PlusIcon } from "@sparkle/icons/app/";
import { cn } from "@sparkle/lib/utils";

const FADE_TRANSITION_CLASSES =
  "s-transition-opacity s-duration-300 s-ease-in-out";

export interface ToolCardProps {
  icon: React.ComponentType;
  label: string;
  description: string | React.ReactNode;
  isSelected: boolean;
  canAdd: boolean;
  cantAddReason?: string;
  onClick?: () => void;
  className?: string;
  mountPortal?: boolean;
  mountPortalContainer?: HTMLElement;
  descriptionLineClamp?: number;
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
      mountPortal,
      mountPortalContainer,
      descriptionLineClamp = 3,
    },
    ref
  ) => {
    return (
      <Card
        ref={ref}
        variant={isSelected ? "secondary" : "primary"}
        onClick={onClick}
        disabled={!canAdd}
        containerClassName="s-h-24 s-p-3"
        className={className}
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
            {canAdd && (
              <Button
                size="xs"
                variant="outline"
                icon={PlusIcon}
                label="Add"
                className={cn(FADE_TRANSITION_CLASSES, "s-flex-shrink-0")}
              />
            )}
            {cantAddReason && (
              <div className="s-flex-shrink-0 s-text-xs s-italic s-text-muted-foreground dark:s-text-muted-foreground-night">
                {cantAddReason}
              </div>
            )}
          </div>
          <TruncatedText
            className="s-text-sm s-text-muted-foreground dark:s-text-muted-foreground-night"
            mountPortal={mountPortal}
            mountPortalContainer={mountPortalContainer}
            lineClamp={descriptionLineClamp}
          >
            {description}
          </TruncatedText>
        </div>
      </Card>
    );
  }
);
ToolCard.displayName = "ToolCard";
