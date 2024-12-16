import React from "react";

import {
  Avatar,
  ButtonProps,
  Card,
  CardActionButton,
} from "@sparkle/components/";
import { MoreIcon } from "@sparkle/icons/";
import { cn } from "@sparkle/lib/utils";

interface BaseAssistantCardProps {
  description: string;
  title: string;
  pictureUrl: string;
  subtitle?: string;
  className?: string;
  onClick?: () => void;
}

type AssistantCardMore = ButtonProps;

export const AssistantCardMore = React.forwardRef<
  HTMLButtonElement,
  AssistantCardMore
>(({ ...props }, ref) => {
  return <CardActionButton ref={ref} icon={MoreIcon} {...props} />;
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
    { className, onClick, title, description, pictureUrl, subtitle, action },
    ref
  ) => {
    return (
      <Card
        ref={ref}
        size="md"
        className={cn("s-flex s-flex-col s-gap-3", className)}
        onClick={onClick}
        action={action}
      >
        <div className="s-flex s-gap-3">
          <Avatar visual={pictureUrl} size="md" />
          <div
            className={cn("-s-mt-0.5 s-flex s-flex-col", action && "s-pr-8")}
          >
            <h3 className="s-line-clamp-1 s-overflow-hidden s-text-ellipsis s-break-all s-text-base s-font-medium">
              {title}
            </h3>
            <p className="s-line-clamp-1 s-overflow-hidden s-text-ellipsis s-text-xs s-text-muted-foreground">
              {subtitle}
            </p>
          </div>
        </div>
        {description && (
          <p className="s-line-clamp-2 s-overflow-hidden s-text-ellipsis s-pb-1 s-text-sm s-text-muted-foreground">
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
    <Card ref={ref} size="lg" className={className} onClick={onClick}>
      <div className="s-flex s-gap-3">
        <Avatar visual={pictureUrl} size="lg" />
        <div className="s-flex s-flex-col s-gap-2 s-text-base s-text-foreground">
          <h3 className="s-font-medium">{title}</h3>
          <p className="s-text-muted-foreground">{description}</p>
        </div>
      </div>
    </Card>
  );
});
LargeAssistantCard.displayName = "LargeAssistantCard";
