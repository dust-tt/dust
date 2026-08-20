import { Avatar } from "@sparkle/components/Avatar";
import { Button } from "@sparkle/components/Button";
import { Card, CardActionButton } from "@sparkle/components/Card";
import { Chip } from "@sparkle/components/Chip";
import { TruncatedText } from "@sparkle/components/TruncatedText";
import { Minus, Plus, XClose } from "@sparkle/icons/v2-stroke";
import { cn } from "@sparkle/lib/utils";
import { cva } from "class-variance-authority";
import React from "react";

const FADE_TRANSITION_CLASSES = "transition-opacity ease-in-out";

export const ACTION_CARD_DIFF_STATUSES = ["added", "removed"] as const;
export type ActionCardDiffStatus = (typeof ACTION_CARD_DIFF_STATUSES)[number];

const actionCardDiffVariants = cva("p-3", {
  variants: {
    diffStatus: {
      added: cn("bg-success-50 border-success-200"),
      removed: cn("bg-warning-50 border-warning-200"),
    },
  },
});

const DIFF_CHIP_CONFIG: Record<
  ActionCardDiffStatus,
  { color: "success" | "warning"; icon: React.ComponentType }
> = {
  added: { color: "success", icon: Plus },
  removed: { color: "warning", icon: Minus },
};

interface ActionCardCommonProps {
  /** Icon representing the capability or tool, rendered in a small Avatar. */
  icon: React.ComponentType;
  iconBackgroundColor?: string;
  iconColor?: string;
  label: string;
  description: React.ReactNode;
  /** Invoked when the card itself is clicked (e.g. to toggle selection). */
  onClick?: () => void;
  className?: string;
  /** Class applied to the outer Card container (e.g. to fix the card height). */
  cardContainerClassName?: string;
  /** Render the truncated-description tooltip in a portal. */
  mountPortal?: boolean;
  /** Container element for the truncated-description tooltip portal. */
  mountPortalContainer?: HTMLElement;
  /** Max number of description lines before truncation (default 2). */
  descriptionLineClamp?: number;
  /** Optional footer link or text; when `onClick` is set it renders as a link. */
  footer?: { label: React.ReactNode; onClick?: () => void };
}

// Selection mode <-> card in a picker grid.
interface ActionCardSelectableProps extends ActionCardCommonProps {
  /** When true, the card is toggleable and shows an "Add" affordance. */
  canAdd: boolean;
  /** Whether the tool is already on the agent (shows the "ADDED" chip). */
  isSelected: boolean;
  disabled?: never;
  cantAddReason?: never;
  onRemove?: never;
  diffStatus?: never;
}

// Display mode <-> card already added.
interface ActionCardDisplayProps extends ActionCardCommonProps {
  canAdd: false;
  /** Invoked when the remove (close) button is clicked; its presence shows the button. */
  onRemove?: () => void;
  disabled?: boolean;
  /** Short italic text explaining why the tool cannot be added. */
  cantAddReason?: string;
  isSelected?: never;
  diffStatus?: never;
}

// Display mode with diff indicator.
interface ActionCardDiffProps extends ActionCardCommonProps {
  canAdd: false;
  onRemove?: () => void;
  disabled?: boolean;
  cantAddReason?: string;
  /** Pending-change indicator: `added` (success tint) or `removed` (warning tint). */
  diffStatus: ActionCardDiffStatus;
  isSelected?: never;
}

export type ActionCardProps =
  | ActionCardSelectableProps
  | ActionCardDisplayProps
  | ActionCardDiffProps;

/**
 * A card representing a capability or tool in the agent builder, showing an icon,
 * label, and description with an optional footer link. It has three modes: selectable
 * (`canAdd` + `isSelected`) for toggling a tool on an agent, display-only
 * (`canAdd={false}`), and diff (`diffStatus` of `added` / `removed`) for pending changes.
 * Use it to list an agent's tools and let builders add or remove them, or to preview
 * toolset changes. For an in-conversation accept/reject action proposal, use
 * ActionCardBlock instead.
 * @summary Tool card for the agent builder.
 */
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
      disabled,
      diffStatus,
      footer,
      onRemove,
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
        disabled={disabled ?? !canAdd}
        containerClassName={cardContainerClassName}
        className={cn(actionCardDiffVariants({ diffStatus }), className)}
        action={
          onRemove ? (
            <CardActionButton
              size="icon"
              icon={XClose}
              onClick={(e: React.MouseEvent<HTMLButtonElement>) => {
                onRemove();
                e.stopPropagation();
              }}
            />
          ) : undefined
        }
      >
        <div className="flex h-full w-full flex-col justify-between">
          <div className="flex flex-col">
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Avatar
                  icon={icon}
                  size="xs"
                  backgroundColor={iconBackgroundColor}
                  iconColor={iconColor}
                />
                <span className="truncate text-sm font-medium">{label}</span>
                {isSelected && (
                  <Chip
                    size="mini"
                    color="success"
                    label="ADDED"
                    className={cn(FADE_TRANSITION_CLASSES, "opacity-100")}
                  />
                )}
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                {diffChip && (
                  <Chip
                    size="xs"
                    color={diffChip.color}
                    icon={diffChip.icon}
                    className={cn(FADE_TRANSITION_CLASSES, "opacity-100")}
                  />
                )}
                {canAdd && (
                  <Button
                    size="xs"
                    variant="outline"
                    icon={Plus}
                    label="Add"
                    className={cn(FADE_TRANSITION_CLASSES, "flex-shrink-0")}
                  />
                )}
                {cantAddReason && (
                  <div className="flex-shrink-0 text-xs italic text-muted-foreground">
                    {cantAddReason}
                  </div>
                )}
              </div>
            </div>
            <TruncatedText
              className="text-xs text-muted-foreground"
              mountPortal={mountPortal}
              mountPortalContainer={mountPortalContainer}
              lineClamp={descriptionLineClamp}
            >
              {description}
            </TruncatedText>
          </div>
          {footer && (
            <div>
              {footer.onClick ? (
                <a
                  onClick={(e) => {
                    e.stopPropagation();
                    footer.onClick?.();
                  }}
                  className="text-xs cursor-pointer text-muted-foreground hover:text-highlight-light hover:underline hover:underline-offset-2"
                >
                  {footer.label}
                </a>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {footer.label}
                </span>
              )}
            </div>
          )}
        </div>
      </Card>
    );
  }
);
ActionCard.displayName = "ActionCard";
