import { cva, type VariantProps } from "class-variance-authority";
import React from "react";

import { Tooltip } from "@sparkle/components/Tooltip";
import {
  ArrowUpOnSquareIcon,
  ChevronLeftIcon,
  TrashIcon,
  XMarkIcon,
} from "@sparkle/icons/app";
import { cn } from "@sparkle/lib/utils";

import { Button } from "./Button";

const barHeaderVariants = cva(
  "s-flex s-h-16 s-flex-row s-items-center s-gap-3 s-border-b s-px-4",
  {
    variants: {
      variant: {
        full: "s-fixed s-left-0 s-right-0 s-top-0 s-z-30 s-backdrop-blur s-border-border-dark/70 s-bg-background/80 dark:s-border-border-dark-night/70 dark:s-bg-background-night/80",
        default:
          "s-relative s-z-10 s-border-structure-200 s-bg-structure-50 dark:s-border-structure-200-night dark:s-bg-structure-50-night",
      },
    },
    defaultVariants: {
      variant: "full",
    },
  }
);

interface BarHeaderProps extends VariantProps<typeof barHeaderVariants> {
  title: string;
  tooltip?: string;
  leftActions?: React.ReactNode;
  rightActions?: React.ReactNode;
  className?: string;
}

export function BarHeader({
  title,
  tooltip,
  leftActions,
  rightActions,
  className,
  variant,
}: BarHeaderProps) {
  const titleClasses = cn(
    "s-text-foreground dark:s-text-foreground-night",
    "s-heading-base s-truncate s-grow"
  );

  return (
    <div className={cn(barHeaderVariants({ variant }), className)}>
      {leftActions && <div className="s-flex s-gap-1">{leftActions}</div>}
      <div className={titleClasses}>
        {tooltip ? (
          <Tooltip
            tooltipTriggerAsChild
            trigger={<span>{title}</span>}
            label={tooltip}
          ></Tooltip>
        ) : (
          title
        )}
      </div>
      {rightActions && <div className="s-flex s-gap-1">{rightActions}</div>}
    </div>
  );
}

type BarHeaderButtonBarCloseProps = {
  variant: "close";
  onClose?: () => void;
};

type BarHeaderButtonBarBackProps = {
  variant: "back";
  onBack?: () => void;
};

type BarHeaderButtonBarValidateProps = {
  variant: "validate";
  onCancel?: () => void;
  onSave?: () => void;
  saveLabel?: string;
  isSaving?: boolean;
  savingLabel?: string;
  saveTooltip?: string;
};

type BarHeaderButtonBarConversationProps = {
  variant: "conversation";
  onDelete?: () => void;
  onShare?: () => void;
};

export type BarHeaderButtonBarProps =
  | BarHeaderButtonBarCloseProps
  | BarHeaderButtonBarBackProps
  | BarHeaderButtonBarValidateProps
  | BarHeaderButtonBarConversationProps;

function ValidateSaveButton(props: BarHeaderButtonBarValidateProps) {
  const button = (
    <Button
      size="sm"
      label={
        props.isSaving
          ? props.savingLabel || "Processing..."
          : props.saveLabel || "Save"
      }
      variant="primary"
      onClick={props.onSave}
      disabled={!props.onSave || props.isSaving}
    />
  );

  return props.saveTooltip ? (
    <Tooltip label={props.saveTooltip} side="left" trigger={button} />
  ) : (
    button
  );
}

BarHeader.ButtonBar = function (props: BarHeaderButtonBarProps) {
  switch (props.variant) {
    case "back":
      return (
        <Button
          size="sm"
          icon={ChevronLeftIcon}
          variant="ghost"
          tooltip="Back"
          onClick={props.onBack}
        />
      );
    case "close":
      return (
        <Button
          size="sm"
          icon={XMarkIcon}
          variant="ghost"
          tooltip="Close"
          onClick={props.onClose}
        />
      );
    case "validate":
      return (
        <>
          <Button
            size="sm"
            label="Cancel"
            variant="ghost"
            onClick={props.onCancel}
            disabled={!props.onCancel || props.isSaving}
          />
          <ValidateSaveButton {...props} />
        </>
      );
    case "conversation":
      return (
        <>
          <Button
            size="sm"
            icon={TrashIcon}
            tooltip="Delete"
            variant="ghost"
            onClick={props.onDelete}
          />
          <Button
            size="sm"
            label="Share"
            icon={ArrowUpOnSquareIcon}
            variant="ghost"
            onClick={props.onShare}
          />
        </>
      );
    default:
      return null;
  }
};
