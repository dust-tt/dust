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
  /** Avatar (or AvatarStack) element displayed next to the title; resized to match `size`. */
  visual?:
    | React.ReactElement<AvatarProps>
    | React.ReactElement<AvatarStackProps>;

  // Content
  subtitle?: string;
  /** Body text of the proposal; hidden (moved to a tooltip) once the card is resolved. */
  description?: React.ReactNode;
  /** Optional detail tucked behind a Collapsible instead of crowding the description; render rich detail with Markdown. */
  collapsibleContent?: React.ReactElement;
  /** Trigger label for `collapsibleContent` (defaults to "Details"). */
  collapsibleLabel?: string;

  // Actions
  /** Custom action element replacing the default accept/reject buttons. */
  actions?: React.ReactElement;
  /** Where the accept/reject buttons render: "header" or "footer" (default). */
  actionsPosition?: ActionButtonPosition;
  /** Label for the accept button (defaults to "Apply"); name the action rather than a generic "OK". */
  applyLabel?: string;
  /** Label for the reject button (defaults to "Reject"). */
  rejectLabel?: string;
  /** When true, shows an "always allow" checkbox in the footer for permission requests. */
  hasCheck?: boolean;
  /** Text next to the `hasCheck` checkbox (defaults to "Always allow"). */
  checkLabel?: string;
  /** Called when the user accepts; wire it to advance `state` to "accepted". */
  onClickAccept?: () => void;
  /** Called when the user rejects; wire it to advance `state` to "rejected". */
  onClickReject?: () => void;

  // State & appearance
  /** Lifecycle state: "active" (default), "disabled", "accepted", or "rejected". */
  state?: ActionCardState;
  /** Title swapped in once `state` is "accepted". */
  acceptedTitle?: string;
  /** Title swapped in once `state` is "rejected". */
  rejectedTitle?: string;
  /** Card visual variant (e.g. "highlight", "warning" for destructive proposals, "secondary"). */
  cardVariant?: CardVariantType;
  /** "default" or "compact" for dense conversation contexts. */
  size?: ActionCardBlockSize;
}

/**
 * Inline, actionable card rendered inside an agent message to propose a change
 * and let the user accept or reject it — e.g. enable a tool, rename an agent,
 * or grant a permission (optionally with an "always allow" checkbox). Tracks a
 * `state` (`active`, `disabled`, `accepted`, `rejected`) and swaps in
 * `acceptedTitle` / `rejectedTitle` once resolved.
 * @summary Accept/reject proposal card in agent messages.
 */

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
