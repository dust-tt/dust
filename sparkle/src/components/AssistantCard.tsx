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
  /** Max number of description lines before truncation (default 2). */
  descriptionLineClamp?: number;
  title: string;
  /** URL of the agent's avatar image. */
  pictureUrl: string;
  /** Secondary line under the title, commonly the agent's authors. */
  subtitle?: string;
  className?: string;
  /** Invoked when the card is clicked, typically to select the agent. */
  onClick?: () => void;
  /** Invoked on right-click, e.g. to open a context menu. */
  onContextMenu?: (event: React.MouseEvent) => void;
  /** Visual style of the underlying Card. */
  variant?: CardVariantType;
}

type AssistantCardMore = Omit<IconOnlyButtonProps, "icon" | "size">;

/**
 * The "more" (dots) action button for an AssistantCard's `action` slot, commonly
 * used as a DropdownMenu trigger for secondary controls (edit, duplicate, remove).
 * @summary Actions button for assistant cards.
 */
export const AssistantCardMore = React.forwardRef<
  HTMLButtonElement,
  AssistantCardMore
>(({ ...props }, ref) => {
  return (
    <CardActionButton size="xs" ref={ref} icon={DotsHorizontal} {...props} />
  );
});
AssistantCardMore.displayName = "AssistantCardMore";

interface AssistantCardProps extends BaseAssistantCardProps {
  /** Slot for a secondary control, commonly an AssistantCardMore dropdown trigger. */
  action?: React.ReactNode;
  /** Size of the avatar (default `md`). */
  iconSize?: "sm" | "md";
}

/**
 * A card presenting an agent for browsing or selection, showing its title, avatar,
 * subtitle (authors), and description, with an optional `action` slot. Use it in
 * agent galleries, pickers, or lists laid out with CardGrid. For a denser tile use
 * CompactAssistantCard; for a wide two-column list row use LargeAssistantCard.
 * @summary Agent card for galleries and pickers.
 */
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
        <div className="flex gap-2">
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
                // text-faint matches Figma's light-mode spec exactly, but
                // its dark value (stone-600, #57534d) is too low-contrast
                // against a dark card — dark:text-muted-foreground (stone-400,
                // #a6a09b, the same value light-mode's text-faint uses) reads
                // cleanly instead.
                "text-faint dark:text-muted-foreground"
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
              "overflow-hidden text-ellipsis pb-1 text-xs",
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

/**
 * The wide variant of AssistantCard for two-column lists: a large avatar next to
 * the title and an up-to-five-line description. Prefer AssistantCard or
 * CompactAssistantCard for grids.
 * @summary Wide agent card for lists.
 */
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

/**
 * The dense tile variant of AssistantCard for grids: a small avatar stacked above
 * the title and a clamped description. Prefer LargeAssistantCard for wide list rows.
 * @summary Dense agent tile for grids.
 */
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
