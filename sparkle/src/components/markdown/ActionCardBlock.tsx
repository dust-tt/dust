import { cva } from "class-variance-authority";
import React, { useEffect, useState } from "react";

import { Avatar } from "@sparkle/components/Avatar";
import { Button } from "@sparkle/components/Button";
import { Card, CardVariantType } from "@sparkle/components/Card";
import { CheckboxWithText } from "@sparkle/components/Checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@sparkle/components/Collapsible";
import * as PlatformLogos from "@sparkle/logo/platforms";

const DEFAULT_APPLY_LABEL = "Apply";
const DEFAULT_REJECT_LABEL = "Reject";
const DEFAULT_CHECK_LABEL = "Always allow";
const DEFAULT_COLLAPSIBLE_LABEL = "Details";

const ACTION_CARD_SIZES = ["sm", "auto"] as const;
type ActionCardSize = (typeof ACTION_CARD_SIZES)[number];

const containerVariants = cva("s-flex-col s-gap-3", {
  variants: {
    size: {
      sm: "s-max-w-lg",
      auto: "",
    },
  },
  defaultVariants: {
    size: "sm",
  },
});

const ACTION_CARD_STATES = [
  "active",
  "disabled",
  "accepted",
  "rejected",
] as const;

type ActionCardState = (typeof ACTION_CARD_STATES)[number];

// Props for markdown directive parsing (comma-separated strings)
interface AvatarStackStringProps {
  avatarNames?: string;
  avatarEmojis?: string;
  avatarVisuals?: string;
  avatarHexBgColors?: string;
  avatarBackgroundColors?: string;
  avatarIconNames?: string;
  avatarIsRounded?: boolean;
}

type ActionButtonPosition = "header" | "footer";

interface ActionCardBlockProps extends AvatarStackStringProps {
  // Visual
  title?: string;
  visual?: React.ReactNode;
  avatars?: Array<React.ComponentProps<typeof Avatar>>;

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
  size?: ActionCardSize;
}

function resolvePlatformLogo(
  name: string
): React.ComponentType<{ className?: string }> | undefined {
  if (Object.prototype.hasOwnProperty.call(PlatformLogos, name)) {
    return PlatformLogos[name as keyof typeof PlatformLogos];
  }
  return undefined;
}

function parseListAttribute(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value !== "string") {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildAvatarStackFromProps(props: AvatarStackStringProps) {
  const avatarNames = parseListAttribute(props.avatarNames);
  const avatarEmojis = parseListAttribute(props.avatarEmojis);
  const avatarVisuals = parseListAttribute(props.avatarVisuals);
  const avatarHexBgColors = parseListAttribute(props.avatarHexBgColors);
  const avatarBackgroundColors = parseListAttribute(
    props.avatarBackgroundColors
  );
  const avatarIconNames = parseListAttribute(props.avatarIconNames);

  return avatarNames.map((name, index) => ({
    name,
    emoji: avatarEmojis[index],
    visual: avatarVisuals[index],
    hexBgColor: avatarHexBgColors[index],
    backgroundColor: avatarBackgroundColors[index],
    icon: avatarIconNames[index]
      ? resolvePlatformLogo(avatarIconNames[index])
      : undefined,
    isRounded: props.avatarIsRounded,
  }));
}

const titleClassVariants = cva("", {
  variants: {
    status: {
      default: "s-heading-base s-text-foreground dark:s-text-foreground-night",
      resolved:
        "s-text-base s-italic s-text-muted-foreground dark:s-text-muted-foreground-night",
      disabled: "s-heading-base s-text-faint dark:s-text-faint-night",
    },
  },
  defaultVariants: {
    status: "default",
  },
});

const descriptionClassVariants = cva("", {
  variants: {
    status: {
      default: "s-text-foreground dark:s-text-foreground-night",
      disabled: "s-text-faint dark:s-text-faint-night",
    },
  },
  defaultVariants: {
    status: "default",
  },
});

export function ActionCardBlock({
  // Visual
  title,
  visual,
  avatars,
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
  size,
  // Avatar string props (markdown parsing)
  avatarNames,
  avatarEmojis,
  avatarVisuals,
  avatarHexBgColors,
  avatarBackgroundColors,
  avatarIconNames,
  avatarIsRounded,
}: ActionCardBlockProps) {
  const [localState, setLocalState] = useState<ActionCardState>(state);
  const [isChecked, setIsChecked] = useState(false);

  const resolvedAvatarList = Array.isArray(avatars)
    ? avatars
    : buildAvatarStackFromProps({
        avatarNames,
        avatarEmojis,
        avatarVisuals,
        avatarHexBgColors,
        avatarBackgroundColors,
        avatarIconNames,
        avatarIsRounded,
      });

  const resolvedVisual =
    resolvedAvatarList.length > 0 ? (
      <Avatar.Stack avatars={resolvedAvatarList} size="sm" nbVisibleItems={4} />
    ) : (
      visual
    );

  const applyVariant = cardVariant === "warning" ? "warning" : "highlight";

  useEffect(() => {
    // Keep local state in sync with props
    setLocalState(state);
  }, [state]);

  const isAccepted = localState === "accepted";
  const isRejected = localState === "rejected";
  const isResolved = isAccepted || isRejected;
  const isDisabled = localState === "disabled";

  const resolvedTitle = isAccepted
    ? (acceptedTitle ?? title)
    : isRejected
      ? (rejectedTitle ?? title)
      : title;

  const titleClasses = titleClassVariants({
    status: isResolved ? "resolved" : isDisabled ? "disabled" : "default",
  });
  const descriptionClasses = descriptionClassVariants({
    status: isDisabled ? "disabled" : "default",
  });

  const handleAcceptClick = () => {
    if (isDisabled || isResolved) {
      return;
    }
    setLocalState("accepted");
    onClickAccept?.();
  };

  const handleRejectClick = () => {
    if (isDisabled || isResolved) {
      return;
    }
    setLocalState("rejected");
    onClickReject?.();
  };

  const defaultActionButtons = (
    <div className="s-flex s-flex-wrap s-justify-end s-gap-2">
      <Button
        variant="outline"
        size="sm"
        label={rejectLabel ?? DEFAULT_REJECT_LABEL}
        disabled={isDisabled}
        onClick={handleRejectClick}
      />
      <Button
        variant={applyVariant}
        size="sm"
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
            <CollapsibleContent className="s-text-sm">
              {collapsibleContent}
            </CollapsibleContent>
          </Collapsible>
        )}
      </>
    );
  };

  return (
    <Card
      variant="primary"
      size="md"
      disabled={isDisabled}
      className={containerVariants({ size })}
    >
      {showHeader && (
        <div className="s-flex s-min-h-9 s-items-center s-justify-between">
          <div className="s-flex s-items-center s-gap-2">
            {resolvedVisual}
            {resolvedTitle && (
              <div className={titleClasses}>{resolvedTitle}</div>
            )}
          </div>
          {showActionsInHeader && actionButtons}
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
