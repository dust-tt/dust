import { Avatar } from "@sparkle/components/Avatar";
import { Button } from "@sparkle/components/Button";
import { Card } from "@sparkle/components/Card";
import { Chip } from "@sparkle/components/Chip";
import { TruncatedText } from "@sparkle/components/TruncatedText";
import { DashIcon, PlusIcon } from "@sparkle/icons/app/";
import { cn } from "@sparkle/lib/utils";
import { cva } from "class-variance-authority";
import React from "react";

const FADE_TRANSITION_CLASSES =
  "s-transition-opacity s-duration-300 s-ease-in-out";

export const ACTION_CARD_DIFF_STATUSES = ["added", "removed"] as const;
export type ActionCardDiffStatus = (typeof ACTION_CARD_DIFF_STATUSES)[number];

const actionCardDiffVariants = cva("s-p-3", {
  variants: {
    diffStatus: {
      added: cn(
        "s-bg-success-50 s-border-success-200",
        "dark:s-bg-success-50-night dark:s-border-success-200-night"
      ),
      removed: cn(
        "s-bg-warning-50 s-border-warning-200",
        "dark:s-bg-warning-50-night dark:s-border-warning-200-night"
      ),
    },
  },
});

const DIFF_CHIP_CONFIG: Record<
  ActionCardDiffStatus,
  { color: "green" | "warning"; icon: React.ComponentType }
> = {
  added: { color: "green", icon: PlusIcon },
  removed: { color: "warning", icon: DashIcon },
};

export interface ActionCardProps {
  icon: React.ComponentType;
  iconBackgroundColor?: string;
  iconColor?: string;
  label: string;
  description: string | React.ReactNode;
  isSelected: boolean;
  canAdd: boolean;
  cantAddReason?: string;
  diffStatus?: ActionCardDiffStatus;
  footer?: { label: string; onClick: () => void };
  onClick?: () => void;
  className?: string;
  cardContainerClassName?: string;
  mountPortal?: boolean;
  mountPortalContainer?: HTMLElement;
  descriptionLineClamp?: number;
}

export const ActionCard = React.forwardRef<HTMLDivElement, ActionCardProps>(
  (
    {
      icon,
      iconBackgroundColor,
      iconColor,
      label,
      description,
      isSelected,
      canAdd,
      cantAddReason,
      diffStatus,
      footer,
      onClick,
      className,
      cardContainerClassName,
      mountPortal,
      mountPortalContainer,
      descriptionLineClamp = 2,
    },
    ref
  ) => {
    const diffChip = diffStatus ? DIFF_CHIP_CONFIG[diffStatus] : null;

    return (
      <Card
        ref={ref}
        variant={isSelected ? "secondary" : "primary"}
        onClick={onClick}
        disabled={!canAdd}
        containerClassName={cardContainerClassName}
        className={cn(actionCardDiffVariants({ diffStatus }), className)}
      >
        <div className="s-flex s-h-full s-w-full s-flex-col s-justify-between">
          <div className="s-flex s-flex-col">
            <div className="s-mb-2 s-flex s-items-center s-justify-between s-gap-2">
              <div className="s-flex s-items-center s-gap-2">
                <Avatar
                  icon={icon}
                  size="sm"
                  backgroundColor={iconBackgroundColor}
                  iconColor={iconColor}
                />
                <span className="s-text-sm s-font-medium">{label}</span>
                {!diffChip && isSelected && (
                  <Chip
                    size="xs"
                    color="green"
                    label="ADDED"
                    className={cn(FADE_TRANSITION_CLASSES, "s-opacity-100")}
                  />
                )}
              </div>
              <div className="s-flex s-flex-shrink-0 s-items-center s-gap-2">
                {diffChip && (
                  <Chip
                    size="xs"
                    color={diffChip.color}
                    icon={diffChip.icon}
                    className={cn(FADE_TRANSITION_CLASSES, "s-opacity-100")}
                  />
                )}
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
          {footer && (
            <div>
              <a
                onClick={(e) => {
                  e.stopPropagation();
                  footer.onClick();
                }}
                className="s-heading-sm s-cursor-pointer s-text-muted-foreground hover:s-text-highlight-light hover:s-underline hover:s-underline-offset-2 dark:s-text-muted-foreground-night dark:hover:s-text-highlight-light-night"
              >
                {footer.label}
              </a>
            </div>
          )}
        </div>
      </Card>
    );
  }
);
ActionCard.displayName = "ActionCard";
