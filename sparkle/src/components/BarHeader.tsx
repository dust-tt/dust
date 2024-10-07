import React from "react";

import {
  ArrowUpOnSquareIcon,
  ChevronLeftIcon,
  TrashIcon,
  XMarkIcon,
} from "@sparkle/icons/solid";
import { classNames } from "@sparkle/lib/utils";

import { Button } from "./Button";

interface BarHeaderProps {
  title: string;
  leftActions?: React.ReactNode;
  rightActions?: React.ReactNode;
  className?: string;
}

export function BarHeader({
  title,
  leftActions,
  rightActions,
  className = "",
}: BarHeaderProps) {
  const titleClasses = classNames(
    "s-text-element-800 dark:s-text-element-800-dark",
    "s-text-base s-font-bold s-truncate s-grow"
  );
  const buttonBarClasses = "s-flex s-gap-1";

  return (
    <div
      className={classNames(
        "s-fixed s-left-0 s-right-0 s-top-0 s-z-30 s-flex s-h-16 s-flex-row s-items-center s-gap-3 s-border-b s-px-4 s-backdrop-blur",
        "s-border-structure-300/30 s-bg-white/80",
        "dark:s-border-structure-300-dark/30 dark:s-bg-structure-50-dark/80",
        className
      )}
    >
      {leftActions && <div className={buttonBarClasses}>{leftActions}</div>}
      <div className={titleClasses}>{title}</div>
      {rightActions && <div className={buttonBarClasses}>{rightActions}</div>}
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

BarHeader.ButtonBar = function (props: BarHeaderButtonBarProps) {
  switch (props.variant) {
    case "back":
      return (
        <Button
          size="sm"
          icon={ChevronLeftIcon}
          variant="tertiary"
          label="Back"
          labelVisible={false}
          onClick={props.onBack}
        />
      );
    case "close":
      return (
        <Button
          size="sm"
          icon={XMarkIcon}
          variant="tertiary"
          label="Close"
          labelVisible={false}
          onClick={props.onClose}
        />
      );
    case "validate":
      return (
        <>
          <Button
            size="sm"
            label="Cancel"
            variant="tertiary"
            onClick={props.onCancel}
            disabled={!props.onCancel || props.isSaving}
          />
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
        </>
      );
    case "conversation":
      return (
        <>
          <Button
            size="sm"
            label="Delete"
            icon={TrashIcon}
            variant="tertiary"
            labelVisible={false}
            onClick={props.onDelete}
          />
          <Button
            size="sm"
            label="Share"
            icon={ArrowUpOnSquareIcon}
            variant="tertiary"
            onClick={props.onShare}
          />
        </>
      );
    default:
      return null;
  }
};
