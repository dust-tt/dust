import { cva, type VariantProps } from "class-variance-authority";
import React from "react";

import { Tooltip } from "@sparkle/components/Tooltip";
import { cn } from "@sparkle/lib/utils";

import { Button } from "./Button";

const barFooterVariants = cva(
  "s-flex s-h-16 s-flex-row s-items-center s-gap-3 s-border-t s-px-4",
  {
    variants: {
      variant: {
        full: "s-fixed s-left-0 s-right-0 s-bottom-0 s-z-30 s-backdrop-blur s-border-border-dark/70 s-bg-background/80 dark:s-border-border-dark-night/70 dark:s-bg-background-night/80",
        default:
          "s-relative s-z-10 s-border-structure-200 s-bg-structure-50 dark:s-border-structure-200-night dark:s-bg-structure-50-night",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

interface BarFooterProps extends VariantProps<typeof barFooterVariants> {
  leftActions?: React.ReactNode;
  rightActions?: React.ReactNode;
  className?: string;
}

export function BarFooter({
  leftActions,
  rightActions,
  className,
  variant,
}: BarFooterProps) {
  return (
    <div className={cn(barFooterVariants({ variant }), className)}>
      {leftActions && <div className="s-flex s-gap-1">{leftActions}</div>}
      <div className="s-flex-grow" />
      {rightActions && <div className="s-flex s-gap-1">{rightActions}</div>}
    </div>
  );
}

type BarFooterButtonBarValidateProps = {
  variant: "validate";
  onCancel?: () => void;
  onSave?: () => void;
  saveLabel?: string;
  isSaving?: boolean;
  isDisabled?: boolean;
  savingLabel?: string;
  saveTooltip?: string;
};

export type BarFooterButtonBarProps = BarFooterButtonBarValidateProps;

function ValidateSaveButton(props: BarFooterButtonBarValidateProps) {
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

BarFooter.ButtonBar = function (props: BarFooterButtonBarProps) {
  switch (props.variant) {
    case "validate":
      return (
        <>
          <Button
            size="sm"
            label="Cancel"
            variant="ghost"
            onClick={props.onCancel}
            disabled={!props.onCancel || props.isSaving || props.isDisabled}
          />
          <ValidateSaveButton {...props} />
        </>
      );
    default:
      return null;
  }
};
