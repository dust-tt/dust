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

import { Button, type ButtonProps } from "./Button";

const barVariants = cva(
  "s-flex s-h-16 s-flex-row s-items-center s-gap-3 s-px-4",
  {
    variants: {
      position: {
        top: "s-border-b",
        bottom: "s-border-t",
      },
      variant: {
        full: "s-fixed s-left-0 s-right-0 s-z-30 s-backdrop-blur s-border-border-dark/70 s-bg-background/80 dark:s-border-border-dark-night/70 dark:s-bg-background-night/80",
        default:
          "s-relative s-z-10 s-border-border s-bg-structure-50 dark:s-border-structure-200-night dark:s-bg-structure-50-night",
      },
    },
    compoundVariants: [
      {
        position: "top",
        variant: "full",
        class: "s-top-0",
      },
      {
        position: "bottom",
        variant: "full",
        class: "s-bottom-0",
      },
    ],
    defaultVariants: {
      position: "top",
      variant: "full",
    },
  }
);

interface BarProps extends VariantProps<typeof barVariants> {
  title?: string;
  tooltip?: string;
  leftActions?: React.ReactNode;
  rightActions?: React.ReactNode;
  className?: string;
}

export function Bar({
  title,
  tooltip,
  leftActions,
  rightActions,
  className,
  position,
  variant,
}: BarProps) {
  const titleClasses = cn(
    "s-text-foreground dark:s-text-foreground-night",
    "s-heading-base s-truncate s-grow"
  );

  return (
    <div className={cn(barVariants({ position, variant }), className)}>
      {leftActions && <div className="s-flex s-gap-1">{leftActions}</div>}
      {title && (
        <div className={titleClasses}>
          {tooltip ? (
            <Tooltip
              tooltipTriggerAsChild
              trigger={<span>{title}</span>}
              label={tooltip}
            />
          ) : (
            title
          )}
        </div>
      )}
      {!title && !leftActions && <div className="s-flex-grow" />}
      {rightActions && <div className="s-flex s-gap-1">{rightActions}</div>}
    </div>
  );
}

type BarButtonBarCloseProps = {
  variant: "close";
  onClose?: () => void;
};

type BarButtonBarBackProps = {
  variant: "back";
  onBack?: () => void;
};

type BarButtonBarValidateProps = {
  variant: "validate";
  cancelButtonProps?: ButtonProps;
  saveButtonProps?: ButtonProps;
};

type BarButtonBarConversationProps = {
  variant: "conversation";
  onDelete?: () => void;
  onShare?: () => void;
};

export type BarButtonBarProps =
  | BarButtonBarCloseProps
  | BarButtonBarBackProps
  | BarButtonBarValidateProps
  | BarButtonBarConversationProps;

Bar.ButtonBar = function (props: BarButtonBarProps) {
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
          {props.cancelButtonProps && <Button {...props.cancelButtonProps} />}
          {props.saveButtonProps && <Button {...props.saveButtonProps} />}
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

// BarHeader component - convenience wrapper for top-positioned Bar
interface BarHeaderProps {
  title: string;
  tooltip?: string;
  leftActions?: React.ReactNode;
  rightActions?: React.ReactNode;
  className?: string;
  variant?: "full" | "default";
}

export function BarHeader({
  title,
  tooltip,
  leftActions,
  rightActions,
  className,
  variant,
}: BarHeaderProps) {
  return (
    <Bar
      position="top"
      title={title}
      tooltip={tooltip}
      leftActions={leftActions}
      rightActions={rightActions}
      className={className}
      variant={variant}
    />
  );
}

export type BarHeaderButtonBarProps = BarButtonBarProps;
BarHeader.ButtonBar = Bar.ButtonBar;

// BarFooter component - convenience wrapper for bottom-positioned Bar
interface BarFooterProps {
  leftActions?: React.ReactNode;
  rightActions?: React.ReactNode;
  className?: string;
  variant?: "full" | "default";
}

export function BarFooter({
  leftActions,
  rightActions,
  className,
  variant,
}: BarFooterProps) {
  return (
    <Bar
      position="bottom"
      leftActions={leftActions}
      rightActions={rightActions}
      className={className}
      variant={variant}
    />
  );
}

export type BarFooterButtonBarProps = BarButtonBarProps;
BarFooter.ButtonBar = Bar.ButtonBar;
