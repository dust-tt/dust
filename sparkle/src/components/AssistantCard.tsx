import React from "react";

import {
  Avatar,
  Card,
  CardActionButton,
  MiniButtonProps,
} from "@sparkle/components/";
import { CardVariantType } from "@sparkle/components/Card";
import { MoreIcon } from "@sparkle/icons/";
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
}

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
    },
    ref
  ) => {
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
            <h3 className="s-line-clamp-1 s-overflow-hidden s-text-ellipsis s-break-all s-text-base s-font-medium">
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
          <h3 className="s-font-medium">{title}</h3>
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
