import { cva } from "class-variance-authority";
import React, { useEffect, useRef, useState } from "react";

import { Avatar } from "@sparkle/components/Avatar";
import { Button } from "@sparkle/components/Button";
import { Card, CardVariantType } from "@sparkle/components/Card";
import { CheckboxWithText } from "@sparkle/components/Checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@sparkle/components/Collapsible";
const DEFAULT_APPLY_LABEL = "Apply";
const DEFAULT_REJECT_LABEL = "Reject";
const DEFAULT_CHECK_LABEL = "Always allow";
const DEFAULT_COLLAPSIBLE_LABEL = "Details";

const ACTION_CARD_SIZES = ["sm", "auto"] as const;
type ActionCardSize = (typeof ACTION_CARD_SIZES)[number];

const ACTION_CARD_STATES = [
  "active",
  "disabled",
  "accepted",
  "rejected",
] as const;

type ActionCardState = (typeof ACTION_CARD_STATES)[number];
type reactElements = React.ReactNode;
type ResponsiveState = "compact" | "default";

const COMPACT_MIN_WIDTH = 400;
const responsiveSizeMap = {
  compact: {
    avatar: "xs",
    button: "xs",
    card: "sm",
  },
  default: {
    avatar: "sm",
    button: "sm",
    card: "md",
  },
} as const satisfies Record<
  ResponsiveState,
  { avatar: "xs" | "sm"; button: "xs" | "sm"; card: "sm" | "md" }
>;

type ActionButtonPosition = "header" | "footer";

interface ActionCardBlockProps {
  // Visual
  title: string;
  visual?: reactElements;

  // Content
  description?: reactElements;
  collapsibleContent?: reactElements;
  collapsibleLabel?: string;

  // Actions
  actions?: reactElements;
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
  size?: ActionCardSize;
}
const resolveVisualSize = (
  visual: reactElements,
  responsiveState: ResponsiveState
) => {
  if (!React.isValidElement(visual)) {
    return visual;
  }

  const size = responsiveSizeMap[responsiveState].avatar;
  if (visual.type === Avatar || visual.type === Avatar.Stack) {
    return React.cloneElement(visual, { size });
  }

  return visual;
};

const titleClassVariants = cva("", {
  variants: {
    status: {
      default: "s-text-foreground dark:s-text-foreground-night",
      resolved:
        "s-italic s-text-muted-foreground dark:s-text-muted-foreground-night",
      disabled: "s-text-faint dark:s-text-faint-night",
    },
    responsiveState: {
      compact: "s-heading-sm",
      default: "s-heading-base",
    },
  },
  defaultVariants: {
    status: "default",
    responsiveState: "default",
  },
});

const descriptionClassVariants = cva("", {
  variants: {
    status: {
      default: "s-text-muted-foreground dark:s-text-muted-foreground-night",
      disabled: "s-text-faint dark:s-text-faint-night",
    },
    responsiveState: {
      compact: "s-text-sm",
      default: "s-text-base",
    },
  },
  defaultVariants: {
    status: "default",
    responsiveState: "default",
  },
});

export function ActionCardBlock({
  // Visual
  title,
  visual,
  // Content
  description,
  collapsibleContent,
  collapsibleLabel,
  // Actions
  actions,
  actionsPosition = "footer",
  applyLabel,
  rejectLabel,
  hasCheck,
  checkLabel,
  onClickAccept,
  onClickReject,
  // State & appearance
  state = "active",
  acceptedTitle,
  rejectedTitle,
  cardVariant,
}: ActionCardBlockProps) {
  const [isChecked, setIsChecked] = useState(false);
  const [responsiveState, setResponsiveState] =
    useState<ResponsiveState>("default");
  const cardContainerRef = useRef<HTMLDivElement | null>(null);
  const resolvedVisual = resolveVisualSize(visual, responsiveState);

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

  const titleClasses = titleClassVariants({
    status: isResolved ? "resolved" : isDisabled ? "disabled" : "default",
    responsiveState,
  });
  const descriptionClasses = descriptionClassVariants({
    status: isDisabled ? "disabled" : "default",
    responsiveState,
  });

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
        size={responsiveSizeMap[responsiveState].button}
        label={rejectLabel ?? DEFAULT_REJECT_LABEL}
        disabled={isDisabled}
        onClick={handleRejectClick}
      />
      <Button
        variant={applyVariant}
        size={responsiveSizeMap[responsiveState].button}
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

  const renderContent = () => {
    return (
      <>
        {description && <div className={descriptionClasses}>{description}</div>}
        {collapsibleContent && (
          <Collapsible>
            <CollapsibleTrigger
              className="s-mb-1"
              label={collapsibleLabel ?? DEFAULT_COLLAPSIBLE_LABEL}
              variant="secondary"
            />
            <CollapsibleContent
              className={
                responsiveState === "compact" ? "s-text-xs" : "s-text-sm"
              }
            >
              {collapsibleContent}
            </CollapsibleContent>
          </Collapsible>
        )}
      </>
    );
  };

  useEffect(() => {
    const container = cardContainerRef.current;
    if (!container || typeof ResizeObserver === "undefined") {
      return;
    }

    const update = () => {
      setResponsiveState(
        container.clientWidth >= COMPACT_MIN_WIDTH ? "default" : "compact"
      );
    };

    update();
    const resizeObserver = new ResizeObserver(update);
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <Card
      variant="primary"
      size={responsiveSizeMap[responsiveState].card}
      disabled={isDisabled}
      containerClassName="s-max-w-lg s-flex-1"
      className={`s-flex-col ${responsiveState === "compact" ? "s-gap-2" : "s-gap-3"}`}
      ref={cardContainerRef}
    >
      {showHeader && (
        <div className="s-flex s-min-h-9 s-flex-wrap s-items-center s-justify-between s-gap-2">
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

      {renderContent()}

      {showActionsInFooter && (
        <div
          className={`s-flex s-flex-wrap s-gap-2 ${hasCheck ? "s-justify-between" : "s-justify-end"}`}
        >
          {hasCheck && (
            <CheckboxWithText
              text={checkLabel ?? DEFAULT_CHECK_LABEL}
              size="sm"
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
}
