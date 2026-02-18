// biome-ignore lint/suspicious/noImportCycles: I'm too lazy to refactor this right now
import { Button } from "@sparkle/components/Button";
// biome-ignore lint/suspicious/noImportCycles: I'm too lazy to refactor this right now
import { Card, type CardVariantType } from "@sparkle/components/Card";
import { CheckboxWithText } from "@sparkle/components/Checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@sparkle/components/Collapsible";
import { Tooltip } from "@sparkle/components/Tooltip";
import { cn } from "@sparkle/lib/utils";
import { cva } from "class-variance-authority";
import React, { useState } from "react";

const DEFAULT_APPLY_LABEL = "Apply";
const DEFAULT_REJECT_LABEL = "Reject";
const DEFAULT_CHECK_LABEL = "Always allow";
const DEFAULT_COLLAPSIBLE_LABEL = "Details";

export type ActionCardState = "active" | "disabled" | "accepted" | "rejected";
export type ActionCardBlockSize = "compact" | "default";

const titleVariants = cva("", {
  variants: {
    size: {
      compact: "s-heading-sm",
      default: "s-heading-base",
    },
    status: {
      active: "s-text-foreground dark:s-text-foreground-night",
      disabled: "s-text-faint dark:s-text-faint-night",
      resolved:
        "s-italic s-text-muted-foreground dark:s-text-muted-foreground-night s-mr-2",
    },
  },
  compoundVariants: [
    { status: "resolved", size: "compact", className: "s-text-sm" },
    { status: "resolved", size: "default", className: "s-text-base" },
  ],
  defaultVariants: { size: "default", status: "active" },
});

const descriptionVariants = cva("", {
  variants: {
    size: {
      compact: "s-text-sm",
      default: "s-text-base",
    },
    status: {
      active: "s-text-muted-foreground dark:s-text-muted-foreground-night",
      disabled: "s-text-faint dark:s-text-faint-night",
    },
  },
  defaultVariants: { size: "default", status: "active" },
});

type ActionButtonPosition = "header" | "footer";

export interface ActionCardBlockProps {
  // Visual
  title: string;
  /** An `<Avatar>` or `<Avatar.Stack>`. Size is forced internally (sm for default, xs for compact). */
  visual?: React.ReactElement;

  // Content
  description?: React.ReactNode;
  collapsibleContent?: React.ReactNode;
  collapsibleLabel?: string;

  // Actions
  actions?: React.ReactNode;
  actionsPosition?: ActionButtonPosition;
  applyLabel?: string;
  rejectLabel?: string;
  hasCheck?: boolean;
  checkLabel?: string;
  onClickAccept?: () => void;
  onClickReject?: () => void;

  // State & appearance
  state?: ActionCardState;
  acceptedTitle?: string;
  rejectedTitle?: string;
  cardVariant?: CardVariantType;
  size?: ActionCardBlockSize;
}

export function ActionCardBlock({
  title,
  visual,
  description,
  collapsibleContent,
  collapsibleLabel,
  actions,
  actionsPosition = "footer",
  applyLabel,
  rejectLabel,
  hasCheck,
  checkLabel,
  onClickAccept,
  onClickReject,
  state = "active",
  acceptedTitle,
  rejectedTitle,
  cardVariant,
  size: sizeProp,
}: ActionCardBlockProps) {
  const [isChecked, setIsChecked] = useState(false);
  const size = sizeProp ?? "default";
  const isCompact = size === "compact";

  const applyVariant = cardVariant === "warning" ? "warning" : "highlight";

  const isAccepted = state === "accepted";
  const isRejected = state === "rejected";
  const isResolved = isAccepted || isRejected;
  const isDisabled = state === "disabled";

  const resolvedTitle = isAccepted
    ? (acceptedTitle ?? title)
    : isRejected
      ? (rejectedTitle ?? title)
      : title;

  const titleClasses = titleVariants({
    size,
    status: isResolved ? "resolved" : isDisabled ? "disabled" : "active",
  });

  const descriptionClasses = descriptionVariants({
    size,
    status: isDisabled ? "disabled" : "active",
  });

  const elementSize = isCompact ? "xs" : "sm";
  const resolvedVisual = visual
    ? React.cloneElement(visual, { size: elementSize })
    : null;

  const handleAcceptClick = () => {
    if (isDisabled || isResolved) {
      return;
    }
    onClickAccept?.();
  };

  const handleRejectClick = () => {
    if (isDisabled || isResolved) {
      return;
    }
    onClickReject?.();
  };

  const defaultActionButtons = (
    <div className="s-flex s-flex-wrap s-justify-end s-gap-2">
      <Button
        variant="outline"
        size={elementSize}
        label={rejectLabel ?? DEFAULT_REJECT_LABEL}
        disabled={isDisabled}
        onClick={handleRejectClick}
      />
      <Button
        variant={applyVariant}
        size={elementSize}
        label={applyLabel ?? DEFAULT_APPLY_LABEL}
        disabled={isDisabled}
        onClick={handleAcceptClick}
      />
    </div>
  );

  const actionButtons = actions ?? defaultActionButtons;

  const showHeader = resolvedVisual || resolvedTitle;
  const showActionsInHeader = !isResolved && actionsPosition === "header";
  const showActionsInFooter = !isResolved && actionsPosition === "footer";
  const tooltipLabel = isResolved ? description : undefined;

  const card = (
    <Card
      variant="primary"
      size={isCompact ? "sm" : "md"}
      disabled={isDisabled}
      containerClassName={
        isResolved ? "s-max-w-lg s-w-fit" : "s-max-w-lg s-w-full"
      }
      className={cn("s-flex-col", isCompact ? "s-gap-2" : "s-gap-3")}
    >
      {showHeader && (
        <div className="s-flex s-min-h-6 s-flex-wrap s-items-center s-justify-between s-gap-2">
          <div className="s-flex s-min-w-0 s-items-center s-gap-2">
            {resolvedVisual}
            {resolvedTitle && (
              <div className={titleClasses}>{resolvedTitle}</div>
            )}
          </div>
          {showActionsInHeader && (
            <div className="s-ml-auto s-shrink-0">{actionButtons}</div>
          )}
        </div>
      )}

      {!isResolved && description && (
        <div className={descriptionClasses}>{description}</div>
      )}

      {collapsibleContent && (
        <Collapsible>
          <CollapsibleTrigger
            className="s-mb-1"
            label={collapsibleLabel ?? DEFAULT_COLLAPSIBLE_LABEL}
            variant="secondary"
          />
          <CollapsibleContent
            className={isCompact ? "s-heading-xs" : "s-heading-sm"}
          >
            {collapsibleContent}
          </CollapsibleContent>
        </Collapsible>
      )}

      {showActionsInFooter && (
        <div
          className={cn(
            "s-flex s-flex-wrap s-gap-2",
            hasCheck ? "s-justify-between" : "s-justify-end"
          )}
        >
          {hasCheck && (
            <CheckboxWithText
              text={checkLabel ?? DEFAULT_CHECK_LABEL}
              size={isCompact ? "xs" : "sm"}
              checked={isChecked}
              disabled={isDisabled}
              onCheckedChange={(value) => setIsChecked(value === true)}
            />
          )}
          {actionButtons}
        </div>
      )}
    </Card>
  );

  return tooltipLabel ? (
    <Tooltip
      label={tooltipLabel}
      tooltipTriggerAsChild
      trigger={
        <span className="s-inline-block s-w-fit">
          <span className="s-pointer-events-none">{card}</span>
        </span>
      }
    />
  ) : (
    card
  );
}
