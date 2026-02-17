// biome-ignore lint/suspicious/noImportCycles: I'm too lazy to refactor this right now
import { Avatar } from "@sparkle/components/Avatar";
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
import * as PlatformLogos from "@sparkle/logo/platforms";
import { cva } from "class-variance-authority";
import React, { useState } from "react";

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

export type ActionCardState = (typeof ACTION_CARD_STATES)[number];

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
      default: "s-heading-sm s-text-foreground dark:s-text-foreground-night",
      resolved:
        "s-text-sm s-italic s-text-muted-foreground dark:s-text-muted-foreground-night",
      disabled: "s-heading-sm s-text-faint dark:s-text-faint-night",
    },
  },
  defaultVariants: {
    status: "default",
  },
});

const descriptionClassVariants = cva("", {
  variants: {
    status: {
      default: "s-text-sm s-text-foreground dark:s-text-foreground-night",
      disabled: "s-text-sm s-text-faint dark:s-text-faint-night",
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
      <Avatar.Stack avatars={resolvedAvatarList} size="xs" nbVisibleItems={4} />
    ) : (
      visual
    );

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
  });
  const descriptionClasses = descriptionClassVariants({
    status: isDisabled ? "disabled" : "default",
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
        size="xs"
        label={rejectLabel ?? DEFAULT_REJECT_LABEL}
        disabled={isDisabled}
        onClick={handleRejectClick}
      />
      <Button
        variant={applyVariant}
        size="xs"
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
      size="sm"
      disabled={isDisabled}
      className={containerVariants({ size })}
    >
      {showHeader && (
        <div className="s-flex s-min-h-9 s-items-center s-justify-between s-gap-2">
          <div className="s-flex s-min-w-0 s-items-center s-gap-2">
            {resolvedVisual && (
              <div className="s-mt-0.5 s-flex-shrink-0">{resolvedVisual}</div>
            )}
            {resolvedTitle && (
              <div className={titleClasses}>{resolvedTitle}</div>
            )}
          </div>
          {showActionsInHeader && (
            <div className="s-flex-shrink-0">{actionButtons}</div>
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
