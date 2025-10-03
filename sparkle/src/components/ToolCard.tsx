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
  toolInfo?: { label: string; onClick: () => void };
  onClick?: () => void;
  className?: string;
  cardContainerClassName?: string;
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
      toolInfo,
      onClick,
      className,
      cardContainerClassName,
      mountPortal,
      mountPortalContainer,
      descriptionLineClamp = 2,
    },
    ref
  ) => {
    return (
      <Card
        ref={ref}
        variant={isSelected ? "secondary" : "primary"}
        onClick={onClick}
        disabled={!canAdd}
        containerClassName={cardContainerClassName}
        className={cn("s-p-3", className)}
      >
        <div className="s-flex s-h-full s-w-full s-flex-col s-justify-between">
          <div className="s-flex s-flex-col">
            <div className="s-mb-2 s-flex s-items-center s-justify-between s-gap-2">
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
              <div className="s-flex s-flex-shrink-0 s-items-center s-gap-2">
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
          {toolInfo && (
            <div>
              <a
                onClick={(e) => {
                  e.stopPropagation();
                  toolInfo.onClick();
                }}
                className="s-heading-sm s-cursor-pointer s-text-muted-foreground hover:s-text-highlight-light hover:s-underline hover:s-underline-offset-2 dark:s-text-muted-foreground-night dark:hover:s-text-highlight-light-night"
              >
                {toolInfo.label}
              </a>
            </div>
          )}
        </div>
      </Card>
    );
  }
);
ToolCard.displayName = "ToolCard";
