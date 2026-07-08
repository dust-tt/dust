import { Avatar } from "@sparkle/components/Avatar";
import type { IconOnlyButtonProps } from "@sparkle/components/Button";
import type { CardVariantType } from "@sparkle/components/Card";
import { Card, CardActionButton } from "@sparkle/components/Card";
import { TruncatedText } from "@sparkle/components/TruncatedText";
import { DotsHorizontal } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import React from "react";

interface BaseAssistantCardProps {
  description: string;
  descriptionLineClamp?: number;
  title: string;
  pictureUrl: string;
  subtitle?: string;
  className?: string;
  onClick?: () => void;
  onContextMenu?: (event: React.MouseEvent) => void;
  variant?: CardVariantType;
}

type AssistantCardMore = Omit<IconOnlyButtonProps, "icon" | "size">;

export const AssistantCardMore = React.forwardRef<
  HTMLButtonElement,
  AssistantCardMore
>(({ ...props }, ref) => {
  return (
    <CardActionButton size="icon" ref={ref} icon={DotsHorizontal} {...props} />
  );
});
AssistantCardMore.displayName = "AssistantCardMore";

interface AssistantCardProps extends BaseAssistantCardProps {
  action?: React.ReactNode;
  iconSize?: "sm" | "md";
}

export const AssistantCard = React.forwardRef<
  HTMLDivElement,
  AssistantCardProps
>(
  (
    {
      className,
      onClick,
      onContextMenu,
      title,
      description,
      descriptionLineClamp = 2,
      pictureUrl,
      subtitle,
      action,
      variant = "primary",
      iconSize = "md",
    },
    ref
  ) => {
    return (
      <Card
        ref={ref}
        size="sm"
        className={cn("flex flex-col gap-3", className)}
        onClick={onClick}
        onContextMenu={onContextMenu}
        action={action}
        variant={variant}
      >
        <div className="flex gap-3">
          <Avatar visual={pictureUrl} size={iconSize} />
          <div className={cn("-mt-0.5 flex flex-col", action && "pr-8")}>
            <h3>
              <TruncatedText
                lineClamp={1}
                className="text-sm font-medium overflow-hidden text-ellipsis break-all notranslate"
              >
                {title}
              </TruncatedText>
            </h3>
            <p
              className={cn(
                "line-clamp-1 overflow-hidden text-ellipsis text-xs",
                "text-muted-foreground"
              )}
            >
              {subtitle}
            </p>
          </div>
        </div>
        {description && (
          <TruncatedText
            lineClamp={descriptionLineClamp}
            className={cn(
              "overflow-hidden text-ellipsis pb-1 text-sm",
              "text-muted-foreground"
            )}
          >
            {description}
          </TruncatedText>
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
      <div className="flex gap-3">
        <Avatar visual={pictureUrl} size="lg" />
        <div className={cn("flex flex-col gap-2 text-base", "text-foreground")}>
          <h3 className="heading-base">{title}</h3>
          <p
            className={cn(
              "line-clamp-5 overflow-hidden text-ellipsis",
              "text-muted-foreground"
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

interface CompactAssistantCardProps extends BaseAssistantCardProps {}

export const CompactAssistantCard = React.forwardRef<
  HTMLDivElement,
  CompactAssistantCardProps
>(
  (
    {
      className,
      onClick,
      title,
      description,
      pictureUrl,
      variant = "secondary",
    },
    ref
  ) => {
    return (
      <Card
        ref={ref}
        size="md"
        className={cn(
          "cursor-pointer flex flex-col items-start gap-1",
          className
        )}
        onClick={onClick}
        variant={variant}
      >
        <Avatar visual={pictureUrl} size="sm" />
        <div className="min-w-0">
          <h3 className="heading-base line-clamp-1 text-foreground">{title}</h3>
          <p className={cn("line-clamp-3 text-sm", "text-muted-foreground")}>
            {description}
          </p>
        </div>
      </Card>
    );
  }
);
CompactAssistantCard.displayName = "CompactAssistantCard";
