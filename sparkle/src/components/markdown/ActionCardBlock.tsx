import type { AvatarProps, AvatarStackProps } from "@sparkle/components/Avatar";
import { Button } from "@sparkle/components/Button";
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

const resolvedTitleClass = "italic font-normal text-muted-foreground mr-2";

const titleVariants = cva("", {
  variants: {
    size: {
      compact: "heading-sm",
      default: "heading-base",
    },
    status: {
      active: "text-foreground",
      disabled: "text-faint",
      accepted: resolvedTitleClass,
      rejected: resolvedTitleClass,
    },
  },
  compoundVariants: [
    { status: "accepted", size: "compact", className: "text-sm" },
    { status: "accepted", size: "default", className: "text-base" },
    { status: "rejected", size: "compact", className: "text-sm" },
    { status: "rejected", size: "default", className: "text-base" },
  ],
  defaultVariants: { size: "default", status: "active" },
});

const descriptionVariants = cva("", {
  variants: {
    size: {
      compact: "text-sm",
      default: "text-base",
    },
    status: {
      active: "text-muted-foreground",
      disabled: "text-faint",
      accepted: "text-faint",
      rejected: "text-faint",
    },
  },
  defaultVariants: { size: "default", status: "active" },
});

const subtitleVariants = cva("", {
  variants: {
    size: {
      compact: "text-sm",
      default: "text-base",
    },
    status: {
      active: "text-foreground",
      disabled: "text-faint",
      accepted: "text-faint",
      rejected: "text-faint",
    },
  },
  defaultVariants: { size: "default", status: "active" },
});

type ActionButtonPosition = "header" | "footer";

export interface ActionCardBlockProps {
  // Visual
  title: string;
  visual?:
    | React.ReactElement<AvatarProps>
    | React.ReactElement<AvatarStackProps>;

  // Content
  subtitle?: string;
  description?: React.ReactNode;
  collapsibleContent?: React.ReactElement;
  collapsibleLabel?: string;

  // Actions
  actions?: React.ReactElement;
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
  subtitle,
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
  size = "default",
}: ActionCardBlockProps) {
  const [isChecked, setIsChecked] = useState(false);
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

  const titleClasses = titleVariants({ size, status: state });

  const subtitleClasses = subtitleVariants({ size, status: state });

  const descriptionClasses = descriptionVariants({ size, status: state });

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
    <div className="flex flex-wrap justify-end gap-2">
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
      containerClassName={isResolved ? "max-w-lg w-fit" : "max-w-lg w-full"}
      className={cn("flex-col", isCompact ? "gap-2" : "gap-3")}
    >
      {showHeader && (
        <div className="flex min-h-6 flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {resolvedVisual}
            <div className="flex min-w-0 flex-col">
              {resolvedTitle && (
                <div className={titleClasses}>{resolvedTitle}</div>
              )}
              {!isResolved && subtitle && (
                <div className={subtitleClasses}>{subtitle}</div>
              )}
            </div>
          </div>
          {showActionsInHeader && (
            <div className="ml-auto shrink-0">{actionButtons}</div>
          )}
        </div>
      )}

      {!isResolved && description && (
        <div className={descriptionClasses}>{description}</div>
      )}

      {collapsibleContent && (
        <Collapsible>
          <CollapsibleTrigger
            className="mb-1"
            label={collapsibleLabel ?? DEFAULT_COLLAPSIBLE_LABEL}
            variant="secondary"
          />
          <CollapsibleContent
            className={isCompact ? "heading-xs" : "heading-sm"}
          >
            {collapsibleContent}
          </CollapsibleContent>
        </Collapsible>
      )}

      {showActionsInFooter && (
        <div
          className={cn(
            "flex flex-wrap gap-2",
            hasCheck ? "justify-between" : "justify-end"
          )}
        >
          {hasCheck && (
            <CheckboxWithText
              text={checkLabel ?? DEFAULT_CHECK_LABEL}
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
        <span className="inline-block w-fit">
          <span className="pointer-events-none">{card}</span>
        </span>
      }
    />
  ) : (
    card
  );
}
