import React from "react";

import { Avatar, Button, ButtonProps, Card } from "@sparkle/components/";
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

interface MetaAssistantCardProps {
  className?: string;
  variant: "sm" | "lg";
  onClick?: () => void;
  children: React.ReactNode;
  action?: React.ReactNode;
}

const MetaAssistantCard = React.forwardRef<
  HTMLDivElement,
  MetaAssistantCardProps
>(({ className, variant, action, onClick, children }, ref) => {
  return (
    <div
      className={cn("s-group/assistant-card s-relative", className)}
      ref={ref}
    >
      <Card
        variant={variant === "sm" ? "primary" : "tertiary"}
        className={cn("s-flex s-h-full s-w-full s-flex-col s-gap-3")}
        size={variant === "sm" ? "sm" : "md"}
        onClick={onClick}
      >
        {children}
      </Card>
      {action && <AssistantCardAction>{action}</AssistantCardAction>}
    </div>
  );
});
MetaAssistantCard.displayName = "MetaAssistantCard";

const AssistantCardAction = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<"div"> & {
    children: React.ReactNode;
  }
>(({ children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "s-absolute s-right-3 s-top-3 s-opacity-0 s-transition-opacity",
        "s-opacity-0 group-focus-within/assistant-card:s-opacity-100 group-hover/assistant-card:s-opacity-100"
      )}
      {...props}
    >
      {children}
    </div>
  );
});

AssistantCardAction.displayName = "AssistantCardAction";

type AssistantCardMore = ButtonProps;

export const AssistantCardMore = React.forwardRef<
  HTMLButtonElement,
  AssistantCardMore & {
    className?: string;
  }
>(({ className }, ref) => {
  return (
    <Button
      ref={ref}
      size="mini"
      variant="outline"
      icon={MoreIcon}
      className={className}
    />
  );
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
      <MetaAssistantCard
        ref={ref}
        variant="sm"
        className={cn("s-flex s-gap-3", className)}
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
      </MetaAssistantCard>
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
    <MetaAssistantCard
      ref={ref}
      variant="lg"
      className={className}
      onClick={onClick}
    >
      <div className="s-flex s-gap-3">
        <Avatar visual={pictureUrl} size="lg" />
        <div className="s-flex s-flex-col s-gap-2 s-text-base s-text-foreground">
          <h3 className="s-font-medium">{title}</h3>
          <p className="s-text-muted-foreground">{description}</p>
        </div>
      </div>
    </MetaAssistantCard>
  );
});
LargeAssistantCard.displayName = "LargeAssistantCard";
