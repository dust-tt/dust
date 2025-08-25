import React from "react";

import {
  Avatar,
  Button,
  Card,
  CardActionButton,
  Chip,
  MiniButtonProps,
} from "@sparkle/components/";
import { CardVariantType } from "@sparkle/components/Card";
import { MoreIcon, PlusIcon } from "@sparkle/icons/app/";
import { cn } from "@sparkle/lib/utils";

interface BaseAssistantCardProps {
  description: string;
  title: string;
  pictureUrl: string;
  subtitle?: string;
  className?: string;
  onClick?: () => void;
  variant?: CardVariantType;
}

// Tool-specific props for the tool variant - based on original BaseToolCard
interface ToolVariantProps {
  icon: React.ComponentType;
  label: string;
  description: string;
  isSelected: boolean;
  canAdd: boolean;
  cantAddReason?: string;
}

type AssistantCardMore = Omit<MiniButtonProps, "icon" | "size">;

export const AssistantCardMore = React.forwardRef<
  HTMLButtonElement,
  AssistantCardMore
>(({ ...props }, ref) => {
  return <CardActionButton size="mini" ref={ref} icon={MoreIcon} {...props} />;
});
AssistantCardMore.displayName = "AssistantCardMore";

interface AssistantCardProps extends BaseAssistantCardProps {
  action?: React.ReactNode;
  // Tool variant props
  toolVariant?: ToolVariantProps;
}

const FADE_TRANSITION_CLASSES =
  "s-transition-opacity s-duration-300 s-ease-in-out";

export const AssistantCard = React.forwardRef<
  HTMLDivElement,
  AssistantCardProps
>(
  (
    {
      className,
      onClick,
      title,
      description,
      pictureUrl,
      subtitle,
      action,
      variant = "primary",
      toolVariant,
    },
    ref
  ) => {
    // If toolVariant is provided, render the tool card layout based on original BaseToolCard
    if (toolVariant) {
      const {
        icon,
        label,
        description: toolDescription,
        isSelected,
        canAdd,
        cantAddReason,
      } = toolVariant;

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
              {toolDescription}
            </div>
          </div>
        </Card>
      );
    }

    // Default assistant card layout
    return (
      <Card
        ref={ref}
        size="md"
        className={cn("s-flex s-flex-col s-gap-3", className)}
        onClick={onClick}
        action={action}
        variant={variant}
      >
        <div className="s-flex s-gap-3">
          <Avatar visual={pictureUrl} size="md" />
          <div
            className={cn("-s-mt-0.5 s-flex s-flex-col", action && "s-pr-8")}
          >
            <h3 className="s-heading-base s-line-clamp-1 s-overflow-hidden s-text-ellipsis s-break-all">
              {title}
            </h3>
            <p
              className={cn(
                "s-line-clamp-1 s-overflow-hidden s-text-ellipsis s-text-xs",
                "s-text-muted-foreground dark:s-text-muted-foreground-night"
              )}
            >
              {subtitle}
            </p>
          </div>
        </div>
        {description && (
          <p
            className={cn(
              "s-line-clamp-2 s-overflow-hidden s-text-ellipsis s-pb-1 s-text-sm",
              "s-text-muted-foreground dark:s-text-muted-foreground-night"
            )}
          >
            {description}
          </p>
        )}
      </Card>
    );
  }
);
AssistantCard.displayName = "AssistantCard";

interface LargeAssistantCardProps extends BaseAssistantCardProps {}

export const LargeAssistantCard = React.forwardRef<
  HTMLDivElement,
  LargeAssistantCardProps
>(({ className, onClick, title, description, pictureUrl }, ref) => {
  return (
    <Card
      ref={ref}
      size="lg"
      className={className}
      onClick={onClick}
      variant="tertiary"
    >
      <div className="s-flex s-gap-3">
        <Avatar visual={pictureUrl} size="lg" />
        <div
          className={cn(
            "s-flex s-flex-col s-gap-2 s-text-base",
            "s-text-foreground dark:s-text-foreground-night"
          )}
        >
          <h3 className="s-font-semibold">{title}</h3>
          <p
            className={cn(
              "s-line-clamp-5 s-overflow-hidden s-text-ellipsis",
              "s-text-muted-foreground dark:s-text-muted-foreground-night"
            )}
          >
            {description}
          </p>
        </div>
      </div>
    </Card>
  );
});
LargeAssistantCard.displayName = "LargeAssistantCard";
